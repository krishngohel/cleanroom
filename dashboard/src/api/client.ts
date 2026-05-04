import type {
  AuditLogEntry,
  Connector,
  SystemStatus,
  User,
  Workflow,
  WorkflowRun,
} from "../types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const TOKEN_KEY = "cleanroom_token";
const USER_KEY = "cleanroom_user";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json() as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  if (resp.status === 204) return undefined as unknown as T;
  return resp.json() as Promise<T>;
}

export const api = {
  auth: {
    login: async (username: string, password: string) => {
      const form = new URLSearchParams({ username, password });
      const resp = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!resp.ok) {
        const body = await resp.json() as { detail?: string };
        throw new Error(body.detail ?? "Login failed");
      }
      const data = await resp.json() as {
        access_token: string;
        user: Pick<User, "id" | "username" | "role">;
      };
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return data;
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },

    me: () => request<User>("/auth/me"),

    getToken: (): string | null => localStorage.getItem(TOKEN_KEY),

    getUser: (): Pick<User, "id" | "username" | "role"> | null => {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Pick<User, "id" | "username" | "role">;
      } catch {
        return null;
      }
    },
  },

  models: {
    list: () =>
      request<{ object: string; data: { id: string; object: string }[] }>("/v1/models").then(
        (r) => r.data,
      ),
  },

  chat: {
    complete: async (
      messages: { role: string; content: string }[],
      model: string,
      onChunk?: (text: string) => void,
    ): Promise<string> => {
      const token = localStorage.getItem(TOKEN_KEY);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages, model, stream: !!onChunk }),
      });

      if (!resp.ok) {
        const body = await resp.json() as { detail?: string };
        throw new Error(body.detail ?? `HTTP ${resp.status}`);
      }

      if (!onChunk) {
        const data = await resp.json() as {
          choices: { message: { content: string } }[];
        };
        return data.choices[0]?.message?.content ?? "";
      }

      // Streaming
      const reader = resp.body?.getReader();
      if (!reader) return "";
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch {
            // incomplete JSON chunk, skip
          }
        }
      }

      return fullText;
    },
  },

  workflows: {
    list: () => request<Workflow[]>("/workflows"),
    get: (id: string) => request<Workflow>(`/workflows/${id}`),
    run: (id: string, parameters: Record<string, unknown>) =>
      request<{ run_id: string; response: string; duration_ms: number; model: string }>(
        `/workflows/${id}/run`,
        { method: "POST", body: JSON.stringify({ parameters }) },
      ),
    runs: (limit = 20, offset = 0) =>
      request<WorkflowRun[]>(`/workflow-runs?limit=${limit}&offset=${offset}`),
    getRun: (id: string) => request<WorkflowRun>(`/workflow-runs/${id}`),
  },

  admin: {
    getUsers: () => request<User[]>("/admin/users"),
    createUser: (data: {
      username: string;
      email: string;
      password: string;
      role: string;
      groups?: string[];
    }) => request<User>("/admin/users", { method: "POST", body: JSON.stringify(data) }),
    updateUser: (id: string, data: { role?: string; groups?: string[]; is_active?: boolean }) =>
      request<User>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    getConnectors: () => request<Connector[]>("/admin/connectors"),
    createConnector: (data: {
      name: string;
      connector_type: string;
      config: Record<string, unknown>;
      description?: string;
    }) =>
      request<Connector>("/admin/connectors", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  audit: {
    getLogs: (params?: {
      username?: string;
      action?: string;
      resource_type?: string;
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.username) qs.set("username", params.username);
      if (params?.action) qs.set("action", params.action);
      if (params?.resource_type) qs.set("resource_type", params.resource_type);
      if (params?.limit != null) qs.set("limit", String(params.limit));
      if (params?.offset != null) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<{ logs: AuditLogEntry[]; offset: number; limit: number }>(
        `/audit/logs${query ? `?${query}` : ""}`,
      );
    },
  },

  status: {
    get: () => request<SystemStatus>("/status"),
  },
};
