import { useEffect, useState } from "react";
import { Gauge, Palette, Plug, ShieldCheck, Users as UsersIcon, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type TenantSettings } from "../api/client";
import type { Connector, User } from "../types";
import { useToast } from "../components/Toast";
import { useTheme } from "../theme/ThemeProvider";
import HardwareCard from "../components/HardwareCard";

type Tab = "users" | "connectors" | "branding" | "compliance" | "hardware";

const FRAMEWORK_OPTIONS = ["SOC2", "HIPAA", "GDPR", "ISO 27001", "FedRAMP", "PCI-DSS"];

export default function Admin() {
  const toast = useToast();
  const { tokens } = useTheme();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
    groups: "",
  });
  const [newConn, setNewConn] = useState({
    name: "",
    connector_type: "filesystem",
    description: "",
    path: "",
    connection_string: "",
    allowed_tables: "",
  });

  useEffect(() => {
    api.admin.getUsers().then(setUsers).catch(() => setUsers([]));
    api.admin.getConnectors().then(setConnectors).catch(() => setConnectors([]));
    api.tenant.get().then(setTenant).catch(() => setTenant(null));
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
      toast.success(`User ${created.username} created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create user";
      setError(msg);
      toast.error(msg);
    }
  };

  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const config: Record<string, unknown> = {};
    if (newConn.connector_type === "filesystem") config["path"] = newConn.path;
    else if (newConn.connector_type === "sql") {
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
      setNewConn({
        name: "",
        connector_type: "filesystem",
        description: "",
        path: "",
        connection_string: "",
        allowed_tables: "",
      });
      toast.success(`Connector ${created.name} created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create connector";
      setError(msg);
      toast.error(msg);
    }
  };

  const handleToggleUser = async (u: User) => {
    try {
      const updated = await api.admin.updateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, ...(updated as Partial<User>) } : x)),
      );
      toast.success(`User ${u.username} ${updated.is_active ? "activated" : "deactivated"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update user";
      setError(msg);
      toast.error(msg);
    }
  };

  const saveTenant = async (patch: Partial<TenantSettings>) => {
    try {
      const updated = await api.tenant.update(patch);
      setTenant(updated);
      toast.success("Branding saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--c-bgInput)",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    padding: "0.55rem 0.8rem",
    color: "var(--c-text)",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.65rem 1rem",
    border: "none",
    borderBottom: `2px solid ${active ? "var(--c-accent)" : "transparent"}`,
    background: "transparent",
    color: active ? "var(--c-accent)" : "var(--c-textMuted)",
    cursor: "pointer",
    fontSize: 13.5,
    fontWeight: active ? 600 : 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  const usersByRole = ["admin", "user", "viewer"].map((r) => ({
    role: r,
    count: users.filter((u) => u.role === r).length,
  }));

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
          Admin Console
        </h1>
        <div style={{ fontSize: 12, color: "var(--c-textSubtle)", marginTop: 4 }}>
          Manage users, data connectors, and branding for your tenant
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--c-dangerSoft)",
            border: "1px solid var(--c-danger)",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
            fontSize: 13,
            color: "var(--c-danger)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ borderBottom: "1px solid var(--c-border)", display: "flex", marginBottom: 20 }}>
        <button style={tabStyle(tab === "users")} onClick={() => setTab("users")}>
          <UsersIcon size={14} /> Users
        </button>
        <button style={tabStyle(tab === "connectors")} onClick={() => setTab("connectors")}>
          <Plug size={14} /> Connectors
        </button>
        <button style={tabStyle(tab === "branding")} onClick={() => setTab("branding")}>
          <Palette size={14} /> Branding
        </button>
        <button style={tabStyle(tab === "compliance")} onClick={() => setTab("compliance")}>
          <ShieldCheck size={14} /> Compliance
        </button>
        <button style={tabStyle(tab === "hardware")} onClick={() => setTab("hardware")}>
          <Gauge size={14} /> Hardware
        </button>
      </div>

      {tab === "hardware" && (
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
          <HardwareCard admin />
          <div style={{ fontSize: 12.5, color: "var(--c-textSubtle)", lineHeight: 1.6 }}>
            On startup Cleanroom probes this server's GPU, RAM, and CPU and automatically
            serves the best model the hardware can run well — and tunes context length,
            GPU offload, and model keep-alive to match. Override the choice here if you
            need a specific model; "Automatic" returns to hardware-based selection.
          </div>
        </div>
      )}

      {tab === "users" && (
        <>
          {/* User stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className="card">
              <div
                style={{
                  fontSize: 11,
                  color: "var(--c-textSubtle)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Total Users
              </div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{users.length}</div>
              <div style={{ fontSize: 12, color: "var(--c-textSubtle)", marginTop: 4 }}>
                {users.filter((u) => u.is_active).length} active
              </div>
            </div>
            <div className="card">
              <div
                style={{
                  fontSize: 11,
                  color: "var(--c-textSubtle)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Users by role
              </div>
              <div style={{ width: "100%", height: 110 }}>
                <ResponsiveContainer>
                  <BarChart data={usersByRole} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
                    <XAxis dataKey="role" tick={{ fill: tokens.textSubtle, fontSize: 11 }} stroke={tokens.border} />
                    <YAxis tick={{ fill: tokens.textSubtle, fontSize: 11 }} stroke={tokens.border} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: tokens.bgElevated,
                        border: `1px solid ${tokens.border}`,
                        borderRadius: 8,
                        color: tokens.text,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill={tokens.accent} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => setShowUserModal(true)}
              style={{
                background: "var(--c-accent)",
                border: "none",
                borderRadius: 8,
                color: "var(--c-accentFg)",
                padding: "7px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Add User
            </button>
          </div>
          <div
            style={{
              background: "var(--c-bgElevated)",
              borderRadius: 12,
              border: "1px solid var(--c-border)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--c-bgSubtle)", color: "var(--c-textSubtle)", textAlign: "left" }}>
                  {["Username", "Email", "Role", "Groups", "Status", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--c-border)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: "10px 14px", color: "var(--c-textMuted)" }}>{u.email}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          background: u.role === "admin" ? "rgba(249,115,22,0.15)" : "var(--c-accentSoft)",
                          color: u.role === "admin" ? "var(--c-warning)" : "var(--c-accent)",
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--c-textSubtle)" }}>
                      {(u.groups ?? []).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ color: u.is_active ? "var(--c-success)" : "var(--c-textSubtle)", fontSize: 12 }}>
                        ● {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => void handleToggleUser(u)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--c-border)",
                          borderRadius: 6,
                          color: "var(--c-textMuted)",
                          padding: "3px 10px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
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

      {tab === "connectors" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              onClick={() => setShowConnectorModal(true)}
              style={{
                background: "var(--c-accent)",
                border: "none",
                borderRadius: 8,
                color: "var(--c-accentFg)",
                padding: "7px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Add Connector
            </button>
          </div>
          <div
            style={{
              background: "var(--c-bgElevated)",
              borderRadius: 12,
              border: "1px solid var(--c-border)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--c-bgSubtle)", color: "var(--c-textSubtle)", textAlign: "left" }}>
                  {["Name", "Type", "Description", "Status"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {connectors.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "var(--c-textSubtle)" }}>
                      No connectors configured yet.
                    </td>
                  </tr>
                ) : (
                  connectors.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--c-border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: "10px 14px", color: "var(--c-textMuted)" }}>{c.connector_type}</td>
                      <td style={{ padding: "10px 14px", color: "var(--c-textSubtle)" }}>{c.description ?? "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ color: c.is_active ? "var(--c-success)" : "var(--c-textSubtle)", fontSize: 12 }}>
                          ● {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "branding" && tenant && (
        <div className="card" style={{ maxWidth: 620 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--c-textSubtle)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            White-label this tenant
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                Brand Name
              </label>
              <input
                value={tenant.brand_name}
                onChange={(e) => setTenant({ ...tenant, brand_name: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                Logo URL
              </label>
              <input
                value={tenant.logo_url ?? ""}
                placeholder="https://your-cdn.example/logo.svg"
                onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                Accent Color
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={tenant.accent_color ?? "#38bdf8"}
                  onChange={(e) => setTenant({ ...tenant, accent_color: e.target.value })}
                  style={{
                    width: 44,
                    height: 36,
                    border: "1px solid var(--c-border)",
                    borderRadius: 8,
                    padding: 0,
                    background: "var(--c-bgInput)",
                    cursor: "pointer",
                  }}
                />
                <input
                  value={tenant.accent_color ?? ""}
                  placeholder="#38bdf8"
                  onChange={(e) => setTenant({ ...tenant, accent_color: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                Default Theme
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTenant({ ...tenant, default_theme: t })}
                    style={{
                      background: tenant.default_theme === t ? "var(--c-accentSoft)" : "transparent",
                      border: `1px solid ${tenant.default_theme === t ? "var(--c-accent)" : "var(--c-border)"}`,
                      color: tenant.default_theme === t ? "var(--c-accent)" : "var(--c-textMuted)",
                      borderRadius: 8,
                      padding: "8px 16px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={tenant.allow_theme_toggle}
                onChange={(e) => setTenant({ ...tenant, allow_theme_toggle: e.target.checked })}
              />
              Allow users to toggle between light & dark
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={tenant.overlay_enabled}
                onChange={(e) => setTenant({ ...tenant, overlay_enabled: e.target.checked })}
              />
              Enable Excel/Word browser overlay
            </label>

            <button
              onClick={() => void saveTenant(tenant)}
              style={{
                background: "var(--c-accent)",
                border: "none",
                borderRadius: 10,
                color: "var(--c-accentFg)",
                padding: "0.6rem 1.4rem",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                alignSelf: "flex-start",
                marginTop: 6,
              }}
            >
              Save Branding
            </button>
          </div>
        </div>
      )}

      {tab === "compliance" && tenant && (
        <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
          <div className="card">
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Compliance Frameworks
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FRAMEWORK_OPTIONS.map((f) => {
                const on = tenant.compliance_frameworks.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() =>
                      setTenant({
                        ...tenant,
                        compliance_frameworks: on
                          ? tenant.compliance_frameworks.filter((x) => x !== f)
                          : [...tenant.compliance_frameworks, f],
                      })
                    }
                    style={{
                      background: on ? "var(--c-accentSoft)" : "transparent",
                      border: `1px solid ${on ? "var(--c-accent)" : "var(--c-border)"}`,
                      color: on ? "var(--c-accent)" : "var(--c-textMuted)",
                      borderRadius: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 8 }}>
              Shown in the dashboard footer and the Cowork browser overlay.
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Data residency & retention
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                  Data residency label
                </label>
                <input
                  value={tenant.data_residency}
                  onChange={(e) => setTenant({ ...tenant, data_residency: e.target.value })}
                  placeholder="on-prem · US-East · EU-West"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
                  Audit log retention (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={tenant.audit_retention_days}
                  onChange={(e) =>
                    setTenant({ ...tenant, audit_retention_days: Number(e.target.value) || 0 })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              User disclosure
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              <input
                type="checkbox"
                checked={tenant.require_disclosure_banner}
                onChange={(e) =>
                  setTenant({ ...tenant, require_disclosure_banner: e.target.checked })
                }
              />
              Show a disclosure banner on every session
            </label>
            <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
              Disclosure text
            </label>
            <textarea
              value={tenant.disclosure_text}
              onChange={(e) => setTenant({ ...tenant, disclosure_text: e.target.value })}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Data Loss Prevention (client-side redaction)</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--c-textMuted)" }}>
                <input
                  type="checkbox"
                  checked={tenant.dlp_enabled}
                  onChange={(e) => setTenant({ ...tenant, dlp_enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tenant.dlp_patterns.map((p, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8 }}>
                  <input
                    value={p.label}
                    onChange={(e) => {
                      const list = [...tenant.dlp_patterns];
                      list[i] = { ...list[i], label: e.target.value.toUpperCase() };
                      setTenant({ ...tenant, dlp_patterns: list });
                    }}
                    placeholder="LABEL"
                    style={inputStyle}
                  />
                  <input
                    value={p.pattern}
                    onChange={(e) => {
                      const list = [...tenant.dlp_patterns];
                      list[i] = { ...list[i], pattern: e.target.value };
                      setTenant({ ...tenant, dlp_patterns: list });
                    }}
                    placeholder="regex"
                    style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace" }}
                  />
                  <button
                    onClick={() =>
                      setTenant({
                        ...tenant,
                        dlp_patterns: tenant.dlp_patterns.filter((_, j) => j !== i),
                      })
                    }
                    style={{
                      background: "transparent",
                      border: "1px solid var(--c-border)",
                      borderRadius: 8,
                      color: "var(--c-textMuted)",
                      padding: "0 10px",
                      cursor: "pointer",
                    }}
                    aria-label="Remove pattern"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setTenant({
                    ...tenant,
                    dlp_patterns: [...tenant.dlp_patterns, { label: "CUSTOM", pattern: "" }],
                  })
                }
                style={{
                  background: "transparent",
                  border: "1px dashed var(--c-border)",
                  color: "var(--c-textMuted)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  alignSelf: "flex-start",
                }}
              >
                + Add pattern
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 8 }}>
              Patterns run client-side before the message is sent. Matches are replaced with
              <code style={{ margin: "0 4px" }}>[LABEL_REDACTED]</code> and counts are reported to the user.
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Computer Use (assistant control)</span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--c-textMuted)",
                marginBottom: 12,
                lineHeight: 1.55,
              }}
            >
              When enabled, an assistant dock appears beside the main app. With user
              consent it can see a shared screen, and with an approved local agent
              installed it can drive the mouse and keyboard to finish small tasks
              (every action is audit-logged).
              <strong style={{ display: "block", marginTop: 6, color: "var(--c-text)" }}>
                These features are off by default. Enable only after reviewing your
                organization's policy.
              </strong>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              <input
                type="checkbox"
                checked={tenant.assistant_dock_enabled}
                onChange={(e) =>
                  setTenant({ ...tenant, assistant_dock_enabled: e.target.checked })
                }
              />
              Show the Assistant Dock to users
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              <input
                type="checkbox"
                checked={tenant.computer_control_enabled}
                onChange={(e) =>
                  setTenant({ ...tenant, computer_control_enabled: e.target.checked })
                }
              />
              Allow Computer Use (cursor + keyboard via local agent)
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--c-text)",
                cursor: "pointer",
                marginBottom: 14,
              }}
            >
              <input
                type="checkbox"
                checked={tenant.require_action_confirmation}
                onChange={(e) =>
                  setTenant({
                    ...tenant,
                    require_action_confirmation: e.target.checked,
                  })
                }
              />
              Require explicit user approval for every action (strongly recommended)
            </label>

            <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
              Local agent WebSocket URL
            </label>
            <input
              value={tenant.agent_socket_url}
              onChange={(e) => setTenant({ ...tenant, agent_socket_url: e.target.value })}
              placeholder="ws://127.0.0.1:9777"
              style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 6 }}>
              The reference agent ships at{" "}
              <code style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>
                installer/computer-agent/
              </code>{" "}
              — install it on each user's machine to enable Computer Use.
            </div>
          </div>

          <button
            onClick={() => void saveTenant(tenant)}
            style={{
              background: "var(--c-accent)",
              border: "none",
              borderRadius: 10,
              color: "var(--c-accentFg)",
              padding: "0.7rem 1.4rem",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              alignSelf: "flex-start",
            }}
          >
            Save Compliance Settings
          </button>
        </div>
      )}

      {showUserModal && (
        <Modal title="Add User" onClose={() => setShowUserModal(false)}>
          <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Username">
              <input
                required
                value={newUser.username}
                onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Role">
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                style={inputStyle}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
            </Field>
            <Field label="Groups (comma-separated)">
              <input
                value={newUser.groups}
                onChange={(e) => setNewUser((p) => ({ ...p, groups: e.target.value }))}
                style={inputStyle}
                placeholder="engineering, finance"
              />
            </Field>
            <ModalActions onCancel={() => setShowUserModal(false)} />
          </form>
        </Modal>
      )}

      {showConnectorModal && (
        <Modal title="Add Connector" onClose={() => setShowConnectorModal(false)}>
          <form onSubmit={handleCreateConnector} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Name">
              <input required value={newConn.name} onChange={(e) => setNewConn((p) => ({ ...p, name: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Type">
              <select
                value={newConn.connector_type}
                onChange={(e) => setNewConn((p) => ({ ...p, connector_type: e.target.value }))}
                style={inputStyle}
              >
                <option value="filesystem">File System</option>
                <option value="sql">SQL Database</option>
              </select>
            </Field>
            <Field label="Description">
              <input
                value={newConn.description}
                onChange={(e) => setNewConn((p) => ({ ...p, description: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            {newConn.connector_type === "filesystem" && (
              <Field label="Directory Path">
                <input
                  required
                  value={newConn.path}
                  onChange={(e) => setNewConn((p) => ({ ...p, path: e.target.value }))}
                  style={inputStyle}
                  placeholder="/data/documents"
                />
              </Field>
            )}
            {newConn.connector_type === "sql" && (
              <>
                <Field label="Connection String">
                  <input
                    required
                    value={newConn.connection_string}
                    onChange={(e) => setNewConn((p) => ({ ...p, connection_string: e.target.value }))}
                    style={inputStyle}
                    placeholder="postgresql://user:pass@host/db"
                  />
                </Field>
                <Field label="Allowed Tables (comma-separated)">
                  <input
                    value={newConn.allowed_tables}
                    onChange={(e) => setNewConn((p) => ({ ...p, allowed_tables: e.target.value }))}
                    style={inputStyle}
                    placeholder="sales, transactions"
                  />
                </Field>
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
      <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-bgElevated)",
          borderRadius: 14,
          padding: "1.5rem",
          width: 440,
          border: "1px solid var(--c-border)",
          boxShadow: "var(--c-shadow)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-textMuted)",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "transparent",
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          color: "var(--c-textMuted)",
          padding: "7px 14px",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Cancel
      </button>
      <button
        type="submit"
        style={{
          background: "var(--c-accent)",
          border: "none",
          borderRadius: 8,
          color: "var(--c-accentFg)",
          padding: "7px 14px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Create
      </button>
    </div>
  );
}
