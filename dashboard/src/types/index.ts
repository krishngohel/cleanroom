export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user" | "viewer";
  groups: string[];
  is_active: boolean;
  created_at: string;
  last_login?: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface WorkflowParameter {
  name: string;
  type: "string" | "date" | "integer" | "text";
  required: boolean;
  description: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  parameters: WorkflowParameter[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  parameters: Record<string, unknown>;
  response: string;
  model_used: string;
  duration_ms: number;
  created_at: string;
}

export interface Connector {
  id: string;
  name: string;
  connector_type: "filesystem" | "sql" | "rest";
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  username: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
}

export interface SystemStatus {
  status: "ok" | "degraded";
  version: string;
  ollama: {
    connected: boolean;
    models: string[];
  };
  database: {
    connected: boolean;
  };
  connectors: {
    total: number;
    active: number;
  };
}

export interface AuthState {
  token: string | null;
  user: Pick<User, "id" | "username" | "role"> | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  default_model: string | null;
  color: string;
  icon: string;
  owner_id: string | null;
  is_shared: boolean;
  file_count: number;
  total_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  filename: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  files: ProjectFile[];
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  root_path: string;
  owner_id: string | null;
  is_shared: boolean;
  is_writable: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface FileRead {
  path: string;
  content: string;
  size_bytes: number;
}

export interface ProposedEdit {
  path: string;
  current_content: string;
  proposed_content: string;
  model: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  slash: string | null;
  body: string;
  category: string;
  icon: string;
  owner_id: string | null;
  is_shared: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSearchSnippet {
  line: number;
  before: string;
  match: string;
  after: string;
}

export interface ProjectSearchHit {
  file_id: string;
  filename: string;
  match_count: number;
  snippets: ProjectSearchSnippet[];
}

export interface ProjectSearchResult {
  query: string;
  file_count: number;
  total_matches: number;
  files: ProjectSearchHit[];
}

export interface InsightsSummary {
  since: string;
  days: number;
  totals: {
    users: number;
    projects: number;
    workspaces: number;
    chats_in_period: number;
    audit_events_in_period: number;
  };
  by_action: { action: string; count: number }[];
  top_users: { username: string; count: number }[];
  daily: { day: string; count: number }[];
}
