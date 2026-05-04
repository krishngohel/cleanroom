import { useState } from "react";
import { api } from "../api/client";
import type { AuditLogEntry } from "../types";

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
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
      setTotal(result.logs.length + newOffset);
      setOffset(newOffset);
    } catch {
      // errors surfaced by empty state
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
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#e2e8f0",
    fontSize: 13,
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Audit Log</h1>
        <button
          onClick={handleExportCSV}
          disabled={logs.length === 0}
          style={{
            background: "transparent",
            border: "1px solid #334155",
            borderRadius: 6,
            color: "#94a3b8",
            padding: "5px 12px",
            cursor: logs.length === 0 ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          Export CSV
        </button>
      </div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
        Immutable append-only log of all platform activity.
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Username…"
          value={filters.username}
          onChange={(e) => setFilters((f) => ({ ...f, username: e.target.value }))}
          style={{ ...inputStyle, width: 160 }}
        />
        <input
          placeholder="Action…"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          style={{ ...inputStyle, width: 160 }}
        />
        <input
          placeholder="Resource type…"
          value={filters.resource_type}
          onChange={(e) => setFilters((f) => ({ ...f, resource_type: e.target.value }))}
          style={{ ...inputStyle, width: 160 }}
        />
        <button
          onClick={() => void fetchLogs(0)}
          style={{
            background: "#0ea5e9",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            padding: "6px 16px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Search
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#64748b" }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: "#475569", textAlign: "center", marginTop: "2rem" }}>
          Use the search filters above and click Search to load logs.
        </div>
      ) : (
        <>
          <div style={{ background: "#1e293b", borderRadius: 10, border: "1px solid #334155", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#64748b", textAlign: "left" }}>
                  {["Time", "Username", "Action", "Resource", "IP"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpanded((prev) => (prev === log.id ? null : log.id))}
                      style={{
                        borderTop: "1px solid #1e293b44",
                        cursor: "pointer",
                        background: expanded === log.id ? "#162032" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 14px" }}>{log.username ?? "—"}</td>
                      <td style={{ padding: "8px 14px", color: "#38bdf8", fontWeight: 500 }}>{log.action}</td>
                      <td style={{ padding: "8px 14px", color: "#94a3b8" }}>
                        {log.resource_type}{log.resource_id ? ` / ${log.resource_id}` : ""}
                      </td>
                      <td style={{ padding: "8px 14px", color: "#475569", fontSize: 12 }}>{log.ip_address ?? "—"}</td>
                    </tr>
                    {expanded === log.id && log.details && (
                      <tr key={`${log.id}-detail`} style={{ background: "#0f172a" }}>
                        <td colSpan={5} style={{ padding: "8px 14px" }}>
                          <pre style={{ margin: 0, fontSize: 12, color: "#94a3b8", overflow: "auto" }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button
              onClick={() => void fetchLogs(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                color: offset === 0 ? "#334155" : "#94a3b8",
                padding: "4px 12px",
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
                border: "1px solid #334155",
                borderRadius: 6,
                color: logs.length < PAGE_SIZE ? "#334155" : "#94a3b8",
                padding: "4px 12px",
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
