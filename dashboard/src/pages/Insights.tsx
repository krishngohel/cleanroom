import { useEffect, useState } from "react";
import {
  Activity,
  FileText,
  FolderOpen,
  MessageSquare,
  Users as UsersIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { InsightsSummary } from "../types";
import { useTheme } from "../theme/ThemeProvider";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export default function Insights() {
  const { tokens } = useTheme();
  const [data, setData] = useState<InsightsSummary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.insights
      .summary(days)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load insights"),
      )
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            Insights
          </h1>
          <div style={{ fontSize: 13, color: "var(--c-textMuted)", marginTop: 4 }}>
            Usage analytics derived from the immutable audit log.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                background: days === r.days ? "var(--c-accentSoft)" : "transparent",
                border: `1px solid ${days === r.days ? "var(--c-accent)" : "var(--c-border)"}`,
                color: days === r.days ? "var(--c-accent)" : "var(--c-textMuted)",
                borderRadius: 8,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--c-dangerSoft)",
            border: "1px solid var(--c-danger)",
            borderRadius: 8,
            padding: "0.6rem 0.85rem",
            fontSize: 13,
            color: "var(--c-danger)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--c-textSubtle)" }}>Loading…</div>
      ) : data ? (
        <>
          {/* Top stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard
              icon={<MessageSquare size={14} />}
              label="Chats"
              value={data.totals.chats_in_period}
              hint={`In the last ${data.days} days`}
              color={tokens.accent}
            />
            <StatCard
              icon={<Activity size={14} />}
              label="Audit events"
              value={data.totals.audit_events_in_period}
              hint="All recorded actions"
              color={tokens.success}
            />
            <StatCard
              icon={<UsersIcon size={14} />}
              label="Total users"
              value={data.totals.users}
              hint="Active or inactive"
              color="#a855f7"
            />
            <StatCard
              icon={<FolderOpen size={14} />}
              label="Projects"
              value={data.totals.projects}
              color="#ec4899"
            />
            <StatCard
              icon={<FileText size={14} />}
              label="File workspaces"
              value={data.totals.workspaces}
              color="#14b8a6"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            {/* Daily activity */}
            <div className="card">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--c-textSubtle)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Daily activity
              </div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={data.daily} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: tokens.textSubtle, fontSize: 11 }}
                      stroke={tokens.border}
                    />
                    <YAxis
                      tick={{ fill: tokens.textSubtle, fontSize: 11 }}
                      stroke={tokens.border}
                      allowDecimals={false}
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
                      type="monotone"
                      dataKey="count"
                      stroke={tokens.accent}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top users */}
            <div className="card">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--c-textSubtle)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Most active people
              </div>
              {data.top_users.length === 0 ? (
                <div style={{ color: "var(--c-textSubtle)", fontSize: 12 }}>No activity yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.top_users.map((u, i) => {
                    const max = Math.max(...data.top_users.map((x) => x.count));
                    const pct = max > 0 ? (u.count / max) * 100 : 0;
                    return (
                      <div key={u.username}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12,
                            color: "var(--c-text)",
                            marginBottom: 2,
                          }}
                        >
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: "var(--c-textSubtle)" }}>{i + 1}.</span>
                            {u.username}
                          </span>
                          <span style={{ color: "var(--c-textSubtle)" }}>{u.count}</span>
                        </div>
                        <div
                          style={{
                            background: "var(--c-bgSubtle)",
                            borderRadius: 4,
                            overflow: "hidden",
                            height: 6,
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: tokens.accent,
                              transition: "width 200ms",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Action breakdown */}
          <div className="card" style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--c-textSubtle)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Actions by type
            </div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart
                  data={data.by_action.slice(0, 12)}
                  margin={{ top: 4, right: 12, left: -12, bottom: 30 }}
                >
                  <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="action"
                    tick={{ fill: tokens.textSubtle, fontSize: 10 }}
                    stroke={tokens.border}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: tokens.textSubtle, fontSize: 11 }}
                    stroke={tokens.border}
                    allowDecimals={false}
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
                  <Bar dataKey="count" fill={tokens.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--c-bgElevated)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        padding: "1rem 1.15rem",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--c-textSubtle)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--c-text)" }}>
        {value.toLocaleString()}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}
