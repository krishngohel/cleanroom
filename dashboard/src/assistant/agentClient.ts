/**
 * WebSocket client for the local Computer Use agent.
 *
 * Connects only to URLs the tenant admin has whitelisted (loopback by default).
 * Every command sent is awaited and the reply is returned. The server never
 * sees these commands — they fly browser → localhost. We do, however, post
 * an audit record to /control/events for every action.
 */

export type ControlAction =
  | { kind: "ping" }
  | { kind: "screenshot" }
  | { kind: "click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { kind: "double_click"; x: number; y: number }
  | { kind: "move"; x: number; y: number }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string; modifiers?: string[] }
  | { kind: "scroll"; dx?: number; dy?: number };

export interface AgentReply {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** For screenshot: base64-encoded PNG. */
  image_b64?: string;
  /** Reported screen size. */
  screen?: { width: number; height: number };
}

type Listener = (status: AgentStatus) => void;

export type AgentStatus =
  | { state: "idle" }
  | { state: "connecting"; url: string }
  | { state: "ready"; url: string; screen?: { width: number; height: number } }
  | { state: "busy"; url: string; action: string }
  | { state: "error"; error: string }
  | { state: "closed" };

export class AgentClient {
  private socket: WebSocket | null = null;
  private url = "";
  private nextId = 1;
  private pending = new Map<number, (r: AgentReply) => void>();
  private listeners = new Set<Listener>();
  private currentStatus: AgentStatus = { state: "idle" };

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  status(): AgentStatus {
    return this.currentStatus;
  }

  private setStatus(s: AgentStatus) {
    this.currentStatus = s;
    for (const l of this.listeners) l(s);
  }

  async connect(url: string, sessionToken: string | null): Promise<void> {
    if (this.socket && this.url === url && this.socket.readyState === WebSocket.OPEN) return;
    this.disconnect();
    this.url = url;
    this.setStatus({ state: "connecting", url });

    const full = sessionToken
      ? `${url}?token=${encodeURIComponent(sessionToken)}`
      : url;

    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(full);
      } catch (err) {
        this.setStatus({ state: "error", error: String(err) });
        reject(err);
        return;
      }
      this.socket = ws;

      const timeout = window.setTimeout(() => {
        this.setStatus({ state: "error", error: "Agent did not respond" });
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error("Connection timeout"));
      }, 4000);

      ws.onopen = () => {
        window.clearTimeout(timeout);
        // Probe the agent for screen size — confirms it's a real Cleanroom agent.
        this.send({ kind: "ping" })
          .then((reply) => {
            this.setStatus({
              state: "ready",
              url,
              screen: reply.screen,
            });
            resolve();
          })
          .catch((err) => {
            this.setStatus({ state: "error", error: String(err) });
            reject(err);
          });
      };

      ws.onerror = () => {
        window.clearTimeout(timeout);
        this.setStatus({
          state: "error",
          error:
            "Could not reach the local agent. Is it running on " + url + "?",
        });
        reject(new Error("WebSocket error"));
      };

      ws.onclose = () => {
        this.setStatus({ state: "closed" });
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { id: number } & AgentReply;
          const resolver = this.pending.get(msg.id);
          if (resolver) {
            this.pending.delete(msg.id);
            resolver(msg);
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };
    });
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.pending.clear();
    this.setStatus({ state: "idle" });
  }

  async send(action: ControlAction): Promise<AgentReply> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Agent not connected");
    }
    const id = this.nextId++;
    const payload = { id, ...action };
    if (action.kind !== "ping" && action.kind !== "screenshot") {
      this.setStatus({ state: "busy", url: this.url, action: action.kind });
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, (reply) => {
        if (this.currentStatus.state === "busy") {
          this.setStatus({ state: "ready", url: this.url });
        }
        if (reply.ok) resolve(reply);
        else reject(new Error(reply.error || "Agent error"));
      });
      try {
        this.socket!.send(JSON.stringify(payload));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }
}

/** Singleton — only one local agent per browser tab. */
export const agentClient = new AgentClient();
