import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Keyboard,
  Loader2,
  MonitorPlay,
  PanelRight,
  PanelRightClose,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../api/client";
import { useCompliance } from "../compliance/useCompliance";
import { applyDlp, totalRedactions } from "../compliance/dlp";
import { useToast } from "./Toast";
import Markdown from "./Markdown";
import {
  agentClient,
  type AgentStatus,
  type ControlAction,
} from "../assistant/agentClient";

type DockState = "hidden" | "rail" | "docked";

interface DockMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

const STATE_KEY = "cleanroom_dock_state_v1";
const VISION_KEY = "cleanroom_dock_vision_v1";

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Props {
  controlEnabled: boolean;
  agentUrl: string;
  requireConfirmation: boolean;
}

export default function AssistantDock({
  controlEnabled,
  agentUrl,
  requireConfirmation,
}: Props) {
  const toast = useToast();
  const { settings: compliance } = useCompliance();
  const [dockState, setDockState] = useState<DockState>(() =>
    safeRead<DockState>(STATE_KEY, "rail"),
  );
  const [messages, setMessages] = useState<DockMsg[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [visionEnabled, setVisionEnabled] = useState<boolean>(() =>
    safeRead<boolean>(VISION_KEY, false),
  );
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ state: "idle" });
  const [controlActive, setControlActive] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    action: ControlAction;
    summary: string;
    target?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Push the body content over so the rest of the app re-flows.
  useEffect(() => {
    const root = document.documentElement;
    let width = "0px";
    if (dockState === "rail") width = "44px";
    else if (dockState === "docked") width = "400px";
    root.style.setProperty("--c-dock-width", width);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(dockState));
    } catch {
      /* ignore */
    }
    return () => {
      root.style.setProperty("--c-dock-width", "0px");
    };
  }, [dockState]);

  useEffect(() => {
    try {
      localStorage.setItem(VISION_KEY, JSON.stringify(visionEnabled));
    } catch {
      /* ignore */
    }
  }, [visionEnabled]);

  // Load models once
  useEffect(() => {
    api.models
      .list()
      .then((list) => {
        const names = list.map((m) => m.id);
        setModels(names);
        if (names.length > 0) setSelectedModel(names[0]);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  // Subscribe to the agent client status
  useEffect(() => {
    return agentClient.on(setAgentStatus);
  }, []);

  // Vision stream lifecycle
  const startVision = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 8 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setVisionEnabled(true);
      // If the user clicks the browser's "Stop sharing" button, sync state back.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopVision();
      });
      toast.success("Vision on — the assistant can see your shared screen");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Permission denied";
      toast.error(`Screen share failed: ${msg}`);
      setVisionEnabled(false);
    }
  }, [toast]);

  const stopVision = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setVisionEnabled(false);
  }, []);

  useEffect(() => {
    return () => stopVision();
  }, [stopVision]);

  // ── Control connection ────────────────────────────────────────────────────

  const connectAgent = useCallback(async () => {
    if (!controlEnabled) {
      toast.error("Computer Use is disabled by your administrator");
      return;
    }
    try {
      await agentClient.connect(agentUrl, api.auth.getToken());
      toast.success("Local agent connected");
      setControlActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connect failed";
      toast.error(msg);
      setControlActive(false);
    }
  }, [controlEnabled, agentUrl, toast]);

  const disconnectAgent = useCallback(() => {
    agentClient.disconnect();
    setControlActive(false);
  }, []);

  useEffect(() => {
    return () => agentClient.disconnect();
  }, []);

  const runAction = async (
    action: ControlAction,
    summary: string,
    target?: string,
  ) => {
    try {
      await agentClient.send(action);
      await api.control
        .recordEvent({
          action: action.kind,
          target: target ?? null,
          summary,
          approved: true,
          details: { ...action },
        })
        .catch(() => undefined);
      addSystemMessage(`✓ ${summary}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error(msg);
      addSystemMessage(`✗ ${summary} — ${msg}`);
    }
  };

  const proposeAction = (action: ControlAction, summary: string, target?: string) => {
    if (!requireConfirmation) {
      void runAction(action, summary, target);
      return;
    }
    setPendingAction({ action, summary, target });
  };

  // ── Chat send ─────────────────────────────────────────────────────────────

  const addSystemMessage = (content: string) => {
    setMessages((p) => [
      ...p,
      {
        id: nextId("sys"),
        role: "system",
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    let outgoing = text;
    if (compliance.dlp_enabled && compliance.dlp_patterns.length > 0) {
      const r = applyDlp(text, compliance.dlp_patterns);
      outgoing = r.text;
      const total = totalRedactions(r);
      if (total > 0) {
        toast.info(`DLP redacted ${total} item${total === 1 ? "" : "s"}`);
      }
    }

    const userMsg: DockMsg = {
      id: nextId("u"),
      role: "user",
      content: outgoing,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: DockMsg = {
      id: nextId("a"),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((p) => [...p, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Build chat history (include a system note about capabilities so the
    // model knows it can suggest screen-control actions).
    const systemNote = [
      "You are an embedded assistant docked alongside the user's main app.",
      visionEnabled
        ? "The user has shared their screen with you (treat any user-pasted screenshots as your visual context)."
        : null,
      controlActive
        ? `You may suggest specific UI actions the user can approve: click(x,y), type("…"), key("Enter"), scroll(dy). Keep them small and reversible. The user must approve each action before it runs.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    const history = [
      { role: "system", content: systemNote },
      ...messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: outgoing },
    ];

    try {
      await api.chat.complete(history, selectedModel, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m,
          ),
        );
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      toast.error(msg);
      setMessages((p) => p.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const statusBadge = useMemo(() => {
    const s = agentStatus;
    if (s.state === "ready") return { color: "var(--c-success)", label: "Agent ready" };
    if (s.state === "busy") return { color: "var(--c-accent)", label: `Working: ${s.action}` };
    if (s.state === "connecting") return { color: "var(--c-warning)", label: "Connecting…" };
    if (s.state === "error") return { color: "var(--c-danger)", label: s.error };
    return { color: "var(--c-textSubtle)", label: "Not connected" };
  }, [agentStatus]);

  if (dockState === "hidden") {
    return (
      <button
        onClick={() => setDockState("rail")}
        title="Open assistant"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          background: "var(--c-accent)",
          color: "var(--c-accentFg)",
          border: "none",
          boxShadow: "var(--c-shadow)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 90,
        }}
      >
        <Bot size={18} />
      </button>
    );
  }

  if (dockState === "rail") {
    return (
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 44,
          background: "var(--c-bgElevated)",
          borderLeft: "1px solid var(--c-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 4px",
          gap: 8,
          zIndex: 80,
        }}
      >
        <button
          onClick={() => setDockState("docked")}
          title="Open assistant"
          style={railBtn(true)}
        >
          <Bot size={16} />
        </button>
        <button
          onClick={() => (visionEnabled ? stopVision() : void startVision())}
          title={visionEnabled ? "Vision on (click to stop)" : "Enable vision"}
          style={railBtn(visionEnabled)}
        >
          {visionEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        {controlEnabled && (
          <button
            onClick={() =>
              agentStatus.state === "ready" ? disconnectAgent() : void connectAgent()
            }
            title={
              agentStatus.state === "ready"
                ? "Computer Use ready"
                : "Connect to local agent"
            }
            style={railBtn(agentStatus.state === "ready")}
          >
            <Keyboard size={14} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setDockState("hidden")}
          title="Hide assistant"
          style={railBtn(false)}
        >
          <X size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 400,
        background: "var(--c-bgElevated)",
        borderLeft: "1px solid var(--c-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 80,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--c-border)",
        }}
      >
        <Bot size={16} style={{ color: "var(--c-accent)" }} />
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--c-text)", flex: 1 }}>
          Assistant
        </div>
        {models.length > 0 && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              background: "var(--c-bgInput)",
              border: "1px solid var(--c-border)",
              borderRadius: 6,
              color: "var(--c-text)",
              padding: "3px 6px",
              fontSize: 11.5,
              outline: "none",
            }}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setDockState("rail")}
          title="Collapse to rail"
          style={smallBtn()}
        >
          <PanelRightClose size={13} />
        </button>
        <button
          onClick={() => setDockState("hidden")}
          title="Hide assistant"
          style={smallBtn()}
        >
          <X size={13} />
        </button>
      </div>

      {/* Vision + control panel */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--c-border)",
          background: "var(--c-bg)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => (visionEnabled ? stopVision() : void startVision())}
            style={pill(visionEnabled)}
          >
            {visionEnabled ? <Camera size={11} /> : <CameraOff size={11} />}
            {visionEnabled ? "Vision on" : "Share screen"}
          </button>
          {controlEnabled ? (
            <button
              onClick={() =>
                agentStatus.state === "ready" ? disconnectAgent() : void connectAgent()
              }
              style={pill(agentStatus.state === "ready")}
            >
              <Keyboard size={11} />
              {agentStatus.state === "ready"
                ? "Computer use ready"
                : agentStatus.state === "connecting"
                ? "Connecting…"
                : "Enable computer use"}
            </button>
          ) : (
            <div
              title="Ask your admin to enable Computer Use under Settings → Compliance"
              style={{ ...pill(false), opacity: 0.55, cursor: "not-allowed" }}
            >
              <ShieldAlert size={11} />
              Computer use disabled
            </div>
          )}
        </div>

        {visionEnabled && (
          <div
            style={{
              position: "relative",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--c-border)",
              background: "#000",
              aspectRatio: "16 / 9",
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 6,
                fontSize: 10,
                color: "#fff",
                background: "rgba(0,0,0,0.5)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              LIVE
            </div>
          </div>
        )}

        {controlEnabled && (
          <div
            style={{
              fontSize: 11,
              color: statusBadge.color,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusBadge.color,
                boxShadow: `0 0 0 3px ${statusBadge.color}33`,
              }}
            />
            <span>{statusBadge.label}</span>
            {agentStatus.state === "ready" && agentStatus.screen && (
              <span style={{ color: "var(--c-textSubtle)" }}>
                · {agentStatus.screen.width}×{agentStatus.screen.height}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {messages.length === 0 ? (
          <div
            style={{
              color: "var(--c-textSubtle)",
              fontSize: 13,
              lineHeight: 1.55,
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            <MonitorPlay
              size={26}
              style={{ opacity: 0.4, marginBottom: 8, color: "var(--c-textMuted)" }}
            />
            <div style={{ color: "var(--c-text)", fontWeight: 600, marginBottom: 4 }}>
              I'm here to help.
            </div>
            <div style={{ maxWidth: 280, marginInline: "auto" }}>
              Ask anything as you work. Turn on{" "}
              <strong>Share screen</strong> so I can see what you see.
              {controlEnabled && " Enable Computer use so I can finish small tasks for you (with your approval)."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => (
              <DockMessage key={m.id} msg={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {pendingAction && (
        <PendingActionApproval
          action={pendingAction}
          onApprove={() => {
            const a = pendingAction;
            setPendingAction(null);
            void runAction(a.action, a.summary, a.target);
          }}
          onReject={() => {
            void api.control
              .recordEvent({
                action: pendingAction.action.kind,
                target: pendingAction.target ?? null,
                summary: pendingAction.summary,
                approved: false,
              })
              .catch(() => undefined);
            addSystemMessage(`✗ Rejected: ${pendingAction.summary}`);
            setPendingAction(null);
          }}
        />
      )}

      {/* Composer */}
      <div
        style={{
          padding: "8px 10px 10px",
          borderTop: "1px solid var(--c-border)",
          background: "var(--c-bg)",
        }}
      >
        <div
          style={{
            background: "var(--c-bgInput)",
            border: "1px solid var(--c-border)",
            borderRadius: 10,
            padding: "6px 8px",
            display: "flex",
            gap: 6,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the assistant…"
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--c-text)",
              fontSize: 13,
              resize: "none",
              minHeight: 22,
              maxHeight: 140,
              overflowY: "auto",
              fontFamily: "inherit",
              padding: "2px 0",
              lineHeight: 1.45,
            }}
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || streaming}
            style={{
              background: input.trim() && !streaming ? "var(--c-accent)" : "var(--c-border)",
              color:
                input.trim() && !streaming ? "var(--c-accentFg)" : "var(--c-textSubtle)",
              border: "none",
              borderRadius: 8,
              padding: "5px 10px",
              cursor: input.trim() && !streaming ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {streaming ? <Loader2 size={12} className="cleanroom-spin" /> : <Send size={12} />}
          </button>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--c-textSubtle)",
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ShieldCheck size={10} /> Everything you ask is audit-logged.
        </div>
      </div>
      <style>{`@keyframes cleanroom-spin { to { transform: rotate(360deg) } } .cleanroom-spin { animation: cleanroom-spin 0.8s linear infinite; }`}</style>
    </aside>
  );
}

function DockMessage({ msg }: { msg: DockMsg }) {
  if (msg.role === "system") {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--c-textSubtle)",
          textAlign: "center",
          padding: "2px 0",
        }}
      >
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--c-textSubtle)",
        }}
      >
        {isUser ? "You" : "Assistant"}
      </div>
      <div
        style={{
          background: isUser ? "var(--c-accentSoft)" : "var(--c-bgSubtle)",
          color: "var(--c-text)",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 13,
          lineHeight: 1.55,
          border: "1px solid var(--c-border)",
        }}
      >
        {msg.content ? <Markdown source={msg.content} /> : (
          <span style={{ color: "var(--c-textMuted)" }}>…</span>
        )}
      </div>
    </div>
  );
}

function PendingActionApproval({
  action,
  onApprove,
  onReject,
}: {
  action: { action: ControlAction; summary: string; target?: string };
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      style={{
        margin: "8px 12px",
        background: "rgba(251,191,36,0.1)",
        border: "1px solid var(--c-warning)",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 12.5,
        color: "var(--c-text)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Keyboard size={12} /> Assistant wants to:
      </div>
      <div style={{ marginBottom: 6, lineHeight: 1.5 }}>{action.summary}</div>
      <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginBottom: 8, fontFamily: "ui-monospace, Consolas, monospace" }}>
        {action.action.kind}{" "}
        {JSON.stringify({ ...action.action, kind: undefined }).replace(/[{}]/g, "")}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onReject} style={pill(false)}>
          Reject
        </button>
        <button
          onClick={onApprove}
          style={{ ...pill(true), background: "var(--c-warning)", borderColor: "var(--c-warning)", color: "#fff" }}
        >
          Approve & run
        </button>
      </div>
    </div>
  );
}

function railBtn(active: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: active ? "var(--c-accentSoft)" : "transparent",
    border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
    color: active ? "var(--c-accent)" : "var(--c-textMuted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function smallBtn(): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid var(--c-border)",
    borderRadius: 6,
    color: "var(--c-textMuted)",
    cursor: "pointer",
    padding: "3px 6px",
    display: "inline-flex",
    alignItems: "center",
  };
}

function pill(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--c-accentSoft)" : "transparent",
    border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
    color: active ? "var(--c-accent)" : "var(--c-textMuted)",
    borderRadius: 99,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 11.5,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}

// Suppress unused-icon warnings — PanelRight is reserved for future use.
void PanelRight;
