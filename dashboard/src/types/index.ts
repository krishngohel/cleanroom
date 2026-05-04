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
