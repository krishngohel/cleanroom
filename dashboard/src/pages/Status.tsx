import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SystemStatus } from "../types";
import SystemStats from "../components/SystemStats";

export default function Status() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const s = await api.status.get();
      setStatus(s);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  };

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = status?.status === "ok" ? "#22c55e" : "#f59e0b";

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>System Status</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: "#475569" }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchStatus()}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#94a3b8",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 6,
          padding: "0.75rem",
          fontSize: 13,
          color: "#fca5a5",
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {status && (
        <>
          {/* Overall */}
          <div style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "1.25rem 1.5rem",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: statusColor }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {status.status === "ok" ? "All systems operational" : "Degraded — check services below"}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Version {status.version}</div>
            </div>
          </div>

          {/* Stats */}
          <SystemStats
            stats={[
              {
                label: "AI Runtime (Ollama)",
                value: status.ollama.connected ? "Connected" : "Offline",
                status: status.ollama.connected ? "ok" : "error",
              },
              {
                label: "Database",
                value: status.database.connected ? "Connected" : "Offline",
                status: status.database.connected ? "ok" : "error",
              },
              {
                label: "Active Connectors",
                value: `${status.connectors.active} / ${status.connectors.total}`,
                status: status.connectors.active > 0 || status.connectors.total === 0 ? "ok" : "warning",
              },
            ]}
          />

          {/* Models */}
          {status.ollama.connected && status.ollama.models.length > 0 && (
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "1.25rem 1.5rem", marginTop: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Available Models
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {status.ollama.models.map((m) => (
                  <span
                    key={m}
                    style={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      padding: "4px 12px",
                      fontSize: 13,
                      color: "#94a3b8",
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!status && !error && (
        <div style={{ color: "#475569" }}>Loading status…</div>
      )}
    </div>
  );
}
