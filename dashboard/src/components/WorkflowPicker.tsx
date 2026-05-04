import type { Workflow } from "../types";

interface Props {
  workflows: Workflow[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function WorkflowPicker({ workflows, selected, onSelect }: Props) {
  if (workflows.length === 0) {
    return <div style={{ fontSize: 13, color: "#475569" }}>No workflows available.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {workflows.map((wf) => {
        const isSelected = wf.id === selected;
        return (
          <button
            key={wf.id}
            onClick={() => onSelect(wf.id)}
            style={{
              background: isSelected ? "rgba(56,189,248,0.1)" : "transparent",
              border: `1px solid ${isSelected ? "#38bdf8" : "#334155"}`,
              borderRadius: 8,
              padding: "0.65rem 0.75rem",
              textAlign: "left",
              cursor: "pointer",
              color: isSelected ? "#38bdf8" : "#e2e8f0",
              width: "100%",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>{wf.name}</div>
            <div style={{ fontSize: 12, color: isSelected ? "#7dd3fc" : "#64748b", marginTop: 2 }}>
              {wf.description.slice(0, 60)}{wf.description.length > 60 ? "…" : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}
