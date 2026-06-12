import type {
  AuditLogEntry,
  Connector,
  FileRead,
  InsightsSummary,
  ProjectDetail,
  ProjectFile,
  ProjectSearchResult,
  ProjectSummary,
  ProposedEdit,
  SavedPrompt,
  SystemStatus,
  TreeEntry,
  User,
  Workflow,
  WorkflowRun,
  Workspace,
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
      projectId?: string | null,
    ): Promise<string> => {
      const token = localStorage.getItem(TOKEN_KEY);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages,
          model,
          stream: !!onChunk,
          ...(projectId ? { project_id: projectId } : {}),
        }),
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

  tenant: {
    getPublic: () => request<PublicTenantSettings>("/tenant/public-settings"),
    get: () => request<TenantSettings>("/tenant/settings"),
    update: (data: Partial<TenantSettings>) =>
      request<TenantSettings>("/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  projects: {
    list: () => request<ProjectSummary[]>("/projects"),
    get: (id: string) => request<ProjectDetail>(`/projects/${id}`),
    create: (data: {
      name: string;
      description?: string;
      system_prompt?: string;
      default_model?: string | null;
      color?: string;
      icon?: string;
      is_shared?: boolean;
    }) =>
      request<ProjectSummary>("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        system_prompt: string;
        default_model: string | null;
        color: string;
        icon: string;
        is_shared: boolean;
      }>,
    ) =>
      request<ProjectSummary>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
    uploadFile: async (id: string, file: File): Promise<ProjectFile> => {
      const token = localStorage.getItem(TOKEN_KEY);
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${BASE_URL}/projects/${id}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
          const body = (await resp.json()) as { detail?: string };
          detail = body.detail ?? detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      return resp.json() as Promise<ProjectFile>;
    },
    removeFile: (projectId: string, fileId: string) =>
      request<void>(`/projects/${projectId}/files/${fileId}`, { method: "DELETE" }),
  },

  code: {
    listWorkspaces: () => request<Workspace[]>("/code/workspaces"),
    createWorkspace: (data: {
      name: string;
      description?: string;
      root_path: string;
      is_shared?: boolean;
      is_writable?: boolean;
    }) =>
      request<Workspace>("/code/workspaces", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    createPersonalWorkspace: (data: {
      name: string;
      description?: string;
      is_shared?: boolean;
    }) =>
      request<Workspace>("/code/workspaces/personal", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getWorkspace: (id: string) => request<Workspace>(`/code/workspaces/${id}`),
    updateWorkspace: (
      id: string,
      data: Partial<{ name: string; description: string; is_shared: boolean; is_writable: boolean }>,
    ) =>
      request<Workspace>(`/code/workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteWorkspace: (id: string) =>
      request<void>(`/code/workspaces/${id}`, { method: "DELETE" }),
    listTree: (id: string) =>
      request<{ entries: TreeEntry[] }>(`/code/workspaces/${id}/tree`),
    readFile: (id: string, path: string) =>
      request<FileRead>(
        `/code/workspaces/${id}/file?path=${encodeURIComponent(path)}`,
      ),
    writeFile: (id: string, path: string, content: string) =>
      request<{ path: string; size_bytes: number }>(
        `/code/workspaces/${id}/file`,
        { method: "PUT", body: JSON.stringify({ path, content }) },
      ),
    createDir: (id: string, path: string) =>
      request<{ path: string; created: boolean }>(
        `/code/workspaces/${id}/dir`,
        { method: "POST", body: JSON.stringify({ path }) },
      ),
    deleteFile: (id: string, path: string) =>
      request<void>(
        `/code/workspaces/${id}/file?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      ),
    proposeEdit: (id: string, path: string, instruction: string, model?: string) =>
      request<ProposedEdit>(`/code/workspaces/${id}/propose`, {
        method: "POST",
        body: JSON.stringify({ path, instruction, ...(model ? { model } : {}) }),
      }),
  },

  prompts: {
    list: () => request<SavedPrompt[]>("/prompts"),
    create: (data: {
      title: string;
      body: string;
      slash?: string | null;
      category?: string;
      icon?: string;
      is_shared?: boolean;
    }) =>
      request<SavedPrompt>("/prompts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SavedPrompt>) =>
      request<SavedPrompt>(`/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<void>(`/prompts/${id}`, { method: "DELETE" }),
    recordUse: (id: string) =>
      request<{ use_count: number }>(`/prompts/${id}/use`, { method: "POST" }),
  },

  search: {
    project: (projectId: string, q: string) =>
      request<ProjectSearchResult>(
        `/projects/${projectId}/search?q=${encodeURIComponent(q)}`,
      ),
  },

  insights: {
    summary: (days = 30) =>
      request<InsightsSummary>(`/insights/summary?days=${days}`),
  },

  control: {
    recordEvent: (data: {
      action: string;
      target?: string | null;
      summary: string;
      approved?: boolean;
      details?: Record<string, unknown>;
    }) =>
      request<{ recorded: boolean }>("/control/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  hardware: {
    status: () => request<HardwareStatus>("/v1/hardware"),
    refresh: () => request<HardwareStatus>("/v1/hardware/refresh", { method: "POST" }),
    setModel: (model: string | null) =>
      request<{ active_model: string; override: string | null }>("/v1/hardware/model", {
        method: "POST",
        body: JSON.stringify({ model }),
      }),
    pull: (model: string) =>
      request<{ started: boolean; model: string }>("/v1/hardware/pull", {
        method: "POST",
        body: JSON.stringify({ model }),
      }),
  },

  agent: {
    /** Run an agent task; events are delivered to onEvent as they stream in. */
    run: async (
      prompt: string,
      opts: { workspaceId?: string | null; model?: string | null },
      onEvent: (e: AgentEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> => {
      const token = localStorage.getItem(TOKEN_KEY);
      const resp = await fetch(`${BASE_URL}/v1/agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          workspace_id: opts.workspaceId ?? null,
          model: opts.model ?? null,
        }),
        signal,
      });
      if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`;
        try {
          detail = ((await resp.json()) as { detail?: string }).detail ?? detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as AgentEvent);
          } catch { /* skip malformed event */ }
        }
      }
    },
    runs: () => request<AgentRunSummary[]>("/v1/agent/runs"),
    getRun: (id: string) => request<AgentRunDetail>(`/v1/agent/runs/${id}`),
  },

  scheduled: {
    list: () => request<ScheduledTaskItem[]>("/v1/scheduled-tasks"),
    create: (data: ScheduledTaskInput) =>
      request<ScheduledTaskItem>("/v1/scheduled-tasks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: ScheduledTaskInput) =>
      request<ScheduledTaskItem>(`/v1/scheduled-tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<void>(`/v1/scheduled-tasks/${id}`, { method: "DELETE" }),
    runNow: (id: string) =>
      request<{ started: boolean }>(`/v1/scheduled-tasks/${id}/run`, { method: "POST" }),
  },
};

// ── Agent / hardware types ────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "run"; id: string }
  | { type: "plan"; steps: string[] }
  | { type: "task_update"; index: number; status: "in_progress" | "done" }
  | { type: "tool_call"; tool: string; args_summary: string }
  | { type: "tool_result"; tool: string; ok: boolean; preview: string }
  | { type: "answer"; text: string }
  | { type: "files"; paths: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AgentRunSummary {
  id: string;
  prompt: string;
  status: string;
  answer_preview: string;
  created_at: string;
  finished_at: string | null;
  workspace_id: string | null;
}

export interface AgentRunDetail extends Omit<AgentRunSummary, "answer_preview"> {
  events: AgentEvent[];
  answer: string;
}

export interface ScheduledTaskInput {
  name: string;
  prompt: string;
  schedule_kind: "daily" | "interval";
  interval_minutes: number;
  daily_time: string;
  enabled: boolean;
  workspace_id?: string | null;
}

export interface ScheduledTaskItem extends ScheduledTaskInput {
  id: string;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
  created_at: string;
}

export interface HardwareStatus {
  hardware: {
    gpus: { name: string; vram_gb: number }[];
    total_vram_gb: number;
    ram_gb: number;
    cpu_cores: number;
    cpu_model: string;
    os: string;
    apple_silicon: boolean;
  } | null;
  recommendation: {
    model: string;
    label: string;
    mode: "gpu" | "cpu";
    reason: string;
    best_for: string;
    options: Record<string, unknown>;
  } | null;
  override: string | null;
  active_model: string;
  pull: { state: string; model?: string; percent?: number; error?: string };
  installed: string[];
  catalog: {
    id: string;
    label: string;
    size_gb: number;
    min_vram_gb: number;
    quality: number;
    best_for: string;
  }[];
}

export interface PublicTenantSettings {
  brand_name: string;
  default_theme: "light" | "dark";
  allow_theme_toggle: boolean;
  accent_color: string | null;
  logo_url: string | null;
  assistant_dock_enabled?: boolean;
}

export interface DlpPattern {
  label: string;
  pattern: string;
}

export interface TenantSettings extends PublicTenantSettings {
  overlay_enabled: boolean;
  compliance_frameworks: string[];
  data_residency: string;
  audit_retention_days: number;
  require_disclosure_banner: boolean;
  disclosure_text: string;
  dlp_enabled: boolean;
  dlp_patterns: DlpPattern[];
  assistant_dock_enabled: boolean;
  computer_control_enabled: boolean;
  agent_socket_url: string;
  require_action_confirmation: boolean;
}
