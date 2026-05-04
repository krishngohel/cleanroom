interface Stat {
  label: string;
  value: string | number;
  status?: "ok" | "warning" | "error";
}

const statusColors: Record<string, string> = {
  ok: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

interface Props {
  stats: Stat[];
}

export default function SystemStats({ stats }: Props) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "1rem 1.25rem",
            minWidth: 180,
            flex: "1 1 180px",
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {stat.label}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {stat.status && (
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: statusColors[stat.status] ?? "#64748b",
                flexShrink: 0,
              }} />
            )}
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stat.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
