import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Workflow, WorkflowRun } from "../types";
import WorkflowPicker from "../components/WorkflowPicker";

export default function Reports() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ response: string; duration_ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<WorkflowRun[]>([]);

  const selectedWorkflow = workflows.find((w) => w.id === selectedId) ?? null;

  useEffect(() => {
    api.workflows.list().then(setWorkflows).catch(() => setWorkflows([]));
    api.workflows.runs().then(setHistory).catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (selectedWorkflow) {
      const defaults: Record<string, string> = {};
      for (const p of selectedWorkflow.parameters) defaults[p.name] = "";
      setParams(defaults);
      setResult(null);
      setError(null);
    }
  }, [selectedId]);

  const handleRun = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.workflows.run(selectedId, params as Record<string, unknown>);
      setResult({ response: res.response, duration_ms: res.duration_ms });
      api.workflows.runs().then(setHistory).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) void navigator.clipboard.writeText(result.response);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    color: "#e2e8f0",
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Left: workflow list */}
      <div style={{
        width: 260,
        borderRight: "1px solid #334155",
        padding: "1.5rem 1rem",
        overflowY: "auto",
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Workflows
        </h2>
        <WorkflowPicker workflows={workflows} selected={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Right: form + result */}
      <div style={{ flex: 1, padding: "1.5rem", overflowY: "auto" }}>
        {!selectedWorkflow ? (
          <div style={{ color: "#475569", marginTop: "3rem", textAlign: "center", fontSize: 15 }}>
            Select a workflow from the left to get started.
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{selectedWorkflow.name}</h1>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>{selectedWorkflow.description}</p>

            {/* Parameters form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20, maxWidth: 560 }}>
              {selectedWorkflow.parameters.map((p) => (
                <div key={p.name}>
                  <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                    {p.name.replace(/_/g, " ")}
                    {p.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
                    {p.description && <span style={{ color: "#475569", marginLeft: 8 }}>— {p.description}</span>}
                  </label>
                  {p.type === "text" ? (
                    <textarea
                      value={params[p.name] ?? ""}
                      onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  ) : (
                    <input
                      type={p.type === "date" ? "date" : "text"}
                      value={params[p.name] ?? ""}
                      onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleRun}
              disabled={loading}
              style={{
                background: loading ? "#334155" : "#0ea5e9",
                border: "none",
                borderRadius: 8,
                color: loading ? "#64748b" : "#fff",
                padding: "0.65rem 1.5rem",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 24,
              }}
            >
              {loading ? "Running…" : "Run Workflow"}
            </button>

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

            {result && (
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Generated in {(result.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: "transparent",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      color: "#94a3b8",
                      padding: "3px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div
                  style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#e2e8f0" }}
                  dangerouslySetInnerHTML={{
                    __html: result.response
                      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\n/g, "<br />"),
                  }}
                />
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>
                  Recent Reports
                </h3>
                <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, overflow: "hidden" }}>
                  {history.slice(0, 10).map((run) => (
                    <div
                      key={run.id}
                      style={{
                        padding: "0.65rem 1rem",
                        borderBottom: "1px solid #334155",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedId(run.workflow_id)}
                    >
                      <span style={{ color: "#94a3b8" }}>{run.workflow_id.replace(/_/g, " ")}</span>
                      <span style={{ color: "#475569", fontSize: 12 }}>
                        {new Date(run.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
