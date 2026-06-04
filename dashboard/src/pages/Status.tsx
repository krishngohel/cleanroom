import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { SystemStatus } from "../types";
import SystemStats from "../components/SystemStats";
import { useTheme } from "../theme/ThemeProvider";

const HISTORY_LIMIT = 20;

export default function Status() {
  const { tokens } = useTheme();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [history, setHistory] = useState<{ t: string; ok: number }[]>([]);

  const fetchStatus = async () => {
    try {
      const s = await api.status.get();
      setStatus(s);
      setLastUpdated(new Date());
      setError(null);
      setHistory((prev) =>
        [
          ...prev,
          {
            t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            ok: s.status === "ok" ? 1 : 0,
          },
        ].slice(-HISTORY_LIMIT),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  };

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const uptimePct = useMemo(() => {
    if (history.length === 0) return 100;
    const ok = history.filter((h) => h.ok === 1).length;
    return Math.round((ok / history.length) * 100);
  }, [history]);

  const statusVarColor =
    status?.status === "ok" ? "var(--c-success)" : "var(--c-warning)";

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            System Status
          </h1>
          <div style={{ fontSize: 12, color: "var(--c-textSubtle)", marginTop: 4 }}>
            Live health metrics for your on-prem deployment
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: "var(--c-textSubtle)" }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchStatus()}
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-textMuted)",
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--c-dangerSoft)",
            border: "1px solid var(--c-danger)",
            borderRadius: 8,
            padding: "0.65rem 0.75rem",
            fontSize: 13,
            color: "var(--c-danger)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {status && (
        <>
          <div
            style={{
              background: "var(--c-bgElevated)",
              border: "1px solid var(--c-border)",
              borderRadius: 14,
              padding: "1.1rem 1.4rem",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: statusVarColor,
                display: "grid",
                placeItems: "center",
                color: "var(--c-accentFg)",
              }}
            >
              <Activity size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text)" }}>
                {status.status === "ok"
                  ? "All systems operational"
                  : "Degraded — check services below"}
              </div>
              <div style={{ fontSize: 12, color: "var(--c-textSubtle)", marginTop: 2 }}>
                Version {status.version} · Recent uptime {uptimePct}%
              </div>
            </div>
          </div>

          <SystemStats
            stats={[
              {
                label: "AI Runtime",
                value: status.ollama.connected ? "Online" : "Offline",
                status: status.ollama.connected ? "ok" : "error",
                hint: `${status.ollama.models.length} models loaded`,
              },
              {
                label: "Database",
                value: status.database.connected ? "Online" : "Offline",
                status: status.database.connected ? "ok" : "error",
              },
              {
                label: "Connectors",
                value: `${status.connectors.active} / ${status.connectors.total}`,
                status:
                  status.connectors.active > 0 || status.connectors.total === 0
                    ? "ok"
                    : "warning",
                hint: "Active / configured",
              },
            ]}
          />

          {/* Uptime chart */}
          <div className="card" style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Recent Status (last {history.length} checks)
            </div>
            <div style={{ width: "100%", height: 160 }}>
              <ResponsiveContainer>
                <LineChart data={history} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: tokens.textSubtle, fontSize: 11 }}
                    stroke={tokens.border}
                  />
                  <YAxis
                    domain={[0, 1]}
                    ticks={[0, 1]}
                    tick={{ fill: tokens.textSubtle, fontSize: 11 }}
                    stroke={tokens.border}
                    tickFormatter={(v) => (v === 1 ? "ok" : "down")}
                  />
                  <Tooltip
                    contentStyle={{
                      background: tokens.bgElevated,
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 8,
                      color: tokens.text,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="ok"
                    stroke={tokens.success}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {status.ollama.connected && status.ollama.models.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--c-textSubtle)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Available Models
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {status.ollama.models.map((m) => (
                  <span
                    key={m}
                    style={{
                      background: "var(--c-bgSubtle)",
                      border: "1px solid var(--c-border)",
                      borderRadius: 8,
                      padding: "4px 12px",
                      fontSize: 13,
                      color: "var(--c-text)",
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
        <div style={{ color: "var(--c-textSubtle)" }}>Loading status…</div>
      )}
    </div>
  );
}
