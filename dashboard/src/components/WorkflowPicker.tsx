import type { Workflow } from "../types";

interface Props {
  workflows: Workflow[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function WorkflowPicker({ workflows, selected, onSelect }: Props) {
  if (workflows.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--c-textSubtle)" }}>No workflows available.</div>;
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
              background: isSelected ? "var(--c-accentSoft)" : "transparent",
              border: `1px solid ${isSelected ? "var(--c-accent)" : "var(--c-border)"}`,
              borderRadius: 10,
              padding: "0.7rem 0.85rem",
              textAlign: "left",
              cursor: "pointer",
              color: isSelected ? "var(--c-accent)" : "var(--c-text)",
              width: "100%",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500 }}>{wf.name}</div>
            <div style={{ fontSize: 12, color: isSelected ? "var(--c-accent)" : "var(--c-textSubtle)", marginTop: 2, opacity: isSelected ? 0.85 : 1 }}>
              {wf.description.slice(0, 70)}
              {wf.description.length > 70 ? "…" : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}
