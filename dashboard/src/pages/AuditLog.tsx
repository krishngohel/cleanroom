import { Fragment, useState } from "react";
import { Download, Search } from "lucide-react";
import { api } from "../api/client";
import type { AuditLogEntry } from "../types";

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    username: "",
    action: "",
    resource_type: "",
  });

  const fetchLogs = async (newOffset = 0) => {
    setLoading(true);
    try {
      const result = await api.audit.getLogs({
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
        limit: PAGE_SIZE,
        offset: newOffset,
      });
      setLogs(result.logs);
      setOffset(newOffset);
    } catch {
      // surfaced by empty state
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ["timestamp", "username", "action", "resource_type", "resource_id", "ip_address"];
    const rows = logs.map((l) => [
      l.timestamp,
      l.username ?? "",
      l.action,
      l.resource_type,
      l.resource_id ?? "",
      l.ip_address ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleanroom_audit_log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--c-bgElevated)",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    padding: "6px 12px",
    color: "var(--c-text)",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
          Audit Log
        </h1>
        <button
          onClick={handleExportCSV}
          disabled={logs.length === 0}
          style={{
            background: "transparent",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            color: "var(--c-textMuted)",
            padding: "6px 14px",
            cursor: logs.length === 0 ? "not-allowed" : "pointer",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>
      <p style={{ color: "var(--c-textSubtle)", fontSize: 13, marginBottom: 20 }}>
        Immutable append-only log of all platform activity.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Username…"
          value={filters.username}
          onChange={(e) => setFilters((f) => ({ ...f, username: e.target.value }))}
          style={{ ...inputStyle, width: 180 }}
        />
        <input
          placeholder="Action…"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          style={{ ...inputStyle, width: 180 }}
        />
        <input
          placeholder="Resource type…"
          value={filters.resource_type}
          onChange={(e) => setFilters((f) => ({ ...f, resource_type: e.target.value }))}
          style={{ ...inputStyle, width: 180 }}
        />
        <button
          onClick={() => void fetchLogs(0)}
          style={{
            background: "var(--c-accent)",
            border: "none",
            borderRadius: 8,
            color: "var(--c-accentFg)",
            padding: "6px 18px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Search size={12} />
          Search
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--c-textSubtle)" }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: "var(--c-textSubtle)", textAlign: "center", marginTop: "2rem", padding: "2rem", border: "1px dashed var(--c-border)", borderRadius: 12 }}>
          Use the filters above and click Search to load logs.
        </div>
      ) : (
        <>
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
                  {["Time", "Username", "Action", "Resource", "IP"].map((h) => (
                    <th
                      key={h}
                      style={{ padding: "10px 14px", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      onClick={() => setExpanded((prev) => (prev === log.id ? null : log.id))}
                      style={{
                        borderTop: "1px solid var(--c-border)",
                        cursor: "pointer",
                        background: expanded === log.id ? "var(--c-bgSubtle)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "9px 14px", color: "var(--c-textSubtle)", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: "9px 14px", color: "var(--c-text)" }}>{log.username ?? "—"}</td>
                      <td style={{ padding: "9px 14px", color: "var(--c-accent)", fontWeight: 600 }}>{log.action}</td>
                      <td style={{ padding: "9px 14px", color: "var(--c-textMuted)" }}>
                        {log.resource_type}
                        {log.resource_id ? ` / ${log.resource_id}` : ""}
                      </td>
                      <td style={{ padding: "9px 14px", color: "var(--c-textSubtle)", fontSize: 12 }}>{log.ip_address ?? "—"}</td>
                    </tr>
                    {expanded === log.id && log.details && (
                      <tr style={{ background: "var(--c-bgSubtle)" }}>
                        <td colSpan={5} style={{ padding: "10px 14px" }}>
                          <pre
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: "var(--c-textMuted)",
                              overflow: "auto",
                              background: "var(--c-codeBg)",
                              padding: 10,
                              borderRadius: 8,
                              border: "1px solid var(--c-border)",
                            }}
                          >
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button
              onClick={() => void fetchLogs(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: offset === 0 ? "var(--c-textSubtle)" : "var(--c-textMuted)",
                padding: "5px 14px",
                cursor: offset === 0 ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              ← Prev
            </button>
            <button
              onClick={() => void fetchLogs(offset + PAGE_SIZE)}
              disabled={logs.length < PAGE_SIZE}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: logs.length < PAGE_SIZE ? "var(--c-textSubtle)" : "var(--c-textMuted)",
                padding: "5px 14px",
                cursor: logs.length < PAGE_SIZE ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
