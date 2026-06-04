interface Stat {
  label: string;
  value: string | number;
  status?: "ok" | "warning" | "error";
  hint?: string;
}

const statusVar: Record<string, string> = {
  ok: "var(--c-success)",
  warning: "var(--c-warning)",
  error: "var(--c-danger)",
};

interface Props {
  stats: Stat[];
}

export default function SystemStats({ stats }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            background: "var(--c-bgElevated)",
            border: "1px solid var(--c-border)",
            borderRadius: 12,
            padding: "1rem 1.15rem",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--c-textSubtle)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            {stat.label}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {stat.status && (
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusVar[stat.status] ?? "var(--c-textSubtle)",
                  flexShrink: 0,
                  boxShadow: `0 0 0 3px ${statusVar[stat.status] ?? "var(--c-textSubtle)"}22`,
                }}
              />
            )}
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text)" }}>{stat.value}</div>
          </div>
          {stat.hint && (
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 6 }}>{stat.hint}</div>
          )}
        </div>
      ))}
    </div>
  );
}
