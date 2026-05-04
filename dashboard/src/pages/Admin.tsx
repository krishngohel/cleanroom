import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Connector, User } from "../types";

type Tab = "users" | "connectors";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New user form
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "user", groups: "" });
  // New connector form
  const [newConn, setNewConn] = useState({ name: "", connector_type: "filesystem", description: "", path: "", connection_string: "", allowed_tables: "" });

  useEffect(() => {
    api.admin.getUsers().then(setUsers).catch(() => setUsers([]));
    api.admin.getConnectors().then(setConnectors).catch(() => setConnectors([]));
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.admin.createUser({
        ...newUser,
        groups: newUser.groups ? newUser.groups.split(",").map((g) => g.trim()) : [],
      });
      setUsers((prev) => [...prev, created as User]);
      setShowUserModal(false);
      setNewUser({ username: "", email: "", password: "", role: "user", groups: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const config: Record<string, unknown> = {};
    if (newConn.connector_type === "filesystem") {
      config["path"] = newConn.path;
    } else if (newConn.connector_type === "sql") {
      config["connection_string"] = newConn.connection_string;
      if (newConn.allowed_tables) {
        config["allowed_tables"] = newConn.allowed_tables.split(",").map((t) => t.trim());
      }
    }
    try {
      const created = await api.admin.createConnector({
        name: newConn.name,
        connector_type: newConn.connector_type,
        config,
        description: newConn.description || undefined,
      });
      setConnectors((prev) => [...prev, created]);
      setShowConnectorModal(false);
      setNewConn({ name: "", connector_type: "filesystem", description: "", path: "", connection_string: "", allowed_tables: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connector");
    }
  };

  const handleToggleUser = async (u: User) => {
    try {
      const updated = await api.admin.updateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...(updated as Partial<User>) } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    color: "#e2e8f0",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 1rem",
    border: "none",
    borderBottom: `2px solid ${active ? "#38bdf8" : "transparent"}`,
    background: "transparent",
    color: active ? "#38bdf8" : "#64748b",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Admin Console</h1>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "0.6rem 0.75rem", fontSize: 13, color: "#fca5a5", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #334155", display: "flex", gap: 0, marginBottom: 20 }}>
        <button style={tabStyle(tab === "users")} onClick={() => setTab("users")}>Users</button>
        <button style={tabStyle(tab === "connectors")} onClick={() => setTab("connectors")}>Connectors</button>
      </div>

      {/* Users tab */}
      {tab === "users" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowUserModal(true)} style={{ background: "#0ea5e9", border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Add User
            </button>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 10, border: "1px solid #334155", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#64748b", textAlign: "left" }}>
                  {["Username", "Email", "Role", "Groups", "Status", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid #1e293b44" }}>
                    <td style={{ padding: "8px 14px", fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: "8px 14px", color: "#94a3b8" }}>{u.email}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{
                        background: u.role === "admin" ? "rgba(249,115,22,0.15)" : "rgba(56,189,248,0.1)",
                        color: u.role === "admin" ? "#fb923c" : "#38bdf8",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 12,
                      }}>{u.role}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>{(u.groups ?? []).join(", ") || "—"}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ color: u.is_active ? "#22c55e" : "#64748b", fontSize: 12 }}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <button
                        onClick={() => void handleToggleUser(u)}
                        style={{ background: "transparent", border: "1px solid #334155", borderRadius: 4, color: "#94a3b8", padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Connectors tab */}
      {tab === "connectors" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowConnectorModal(true)} style={{ background: "#0ea5e9", border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Add Connector
            </button>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 10, border: "1px solid #334155", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#64748b", textAlign: "left" }}>
                  {["Name", "Type", "Description", "Status"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {connectors.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "#475569" }}>No connectors configured yet.</td></tr>
                ) : connectors.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #1e293b44" }}>
                    <td style={{ padding: "8px 14px", fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: "8px 14px", color: "#94a3b8" }}>{c.connector_type}</td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>{c.description ?? "—"}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ color: c.is_active ? "#22c55e" : "#64748b", fontSize: 12 }}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* User modal */}
      {showUserModal && (
        <Modal title="Add User" onClose={() => setShowUserModal(false)}>
          <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Username"><input required value={newUser.username} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Email"><input required type="email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Password"><input required type="password" value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Role">
              <select value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))} style={inputStyle}>
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
            </Field>
            <Field label="Groups (comma-separated)"><input value={newUser.groups} onChange={(e) => setNewUser((p) => ({ ...p, groups: e.target.value }))} style={inputStyle} placeholder="engineering, finance" /></Field>
            <ModalActions onCancel={() => setShowUserModal(false)} />
          </form>
        </Modal>
      )}

      {/* Connector modal */}
      {showConnectorModal && (
        <Modal title="Add Connector" onClose={() => setShowConnectorModal(false)}>
          <form onSubmit={handleCreateConnector} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Name"><input required value={newConn.name} onChange={(e) => setNewConn((p) => ({ ...p, name: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Type">
              <select value={newConn.connector_type} onChange={(e) => setNewConn((p) => ({ ...p, connector_type: e.target.value }))} style={inputStyle}>
                <option value="filesystem">File System</option>
                <option value="sql">SQL Database</option>
              </select>
            </Field>
            <Field label="Description"><input value={newConn.description} onChange={(e) => setNewConn((p) => ({ ...p, description: e.target.value }))} style={inputStyle} /></Field>
            {newConn.connector_type === "filesystem" && (
              <Field label="Directory Path"><input required value={newConn.path} onChange={(e) => setNewConn((p) => ({ ...p, path: e.target.value }))} style={inputStyle} placeholder="/data/documents" /></Field>
            )}
            {newConn.connector_type === "sql" && (
              <>
                <Field label="Connection String"><input required value={newConn.connection_string} onChange={(e) => setNewConn((p) => ({ ...p, connection_string: e.target.value }))} style={inputStyle} placeholder="postgresql://user:pass@host/db" /></Field>
                <Field label="Allowed Tables (comma-separated)"><input value={newConn.allowed_tables} onChange={(e) => setNewConn((p) => ({ ...p, allowed_tables: e.target.value }))} style={inputStyle} placeholder="sales, transactions" /></Field>
              </>
            )}
            <ModalActions onCancel={() => setShowConnectorModal(false)} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: "1.5rem", width: 440, border: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
      <button type="button" onClick={onCancel} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
      <button type="submit" style={{ background: "#0ea5e9", border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Create</button>
    </div>
  );
}
