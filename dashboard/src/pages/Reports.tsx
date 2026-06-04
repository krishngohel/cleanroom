import { useEffect, useState } from "react";
import { Copy, Loader2, Play } from "lucide-react";
import { api } from "../api/client";
import type { Workflow, WorkflowRun } from "../types";
import WorkflowPicker from "../components/WorkflowPicker";
import Markdown from "../components/Markdown";
import { useToast } from "../components/Toast";

export default function Reports() {
  const toast = useToast();
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
      toast.success(`Report generated in ${(res.duration_ms / 1000).toFixed(1)}s`);
      api.workflows.runs().then(setHistory).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Workflow failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      void navigator.clipboard.writeText(result.response);
      toast.success("Copied to clipboard");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--c-bgInput)",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    padding: "0.55rem 0.8rem",
    color: "var(--c-text)",
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div
        style={{
          width: 280,
          borderRight: "1px solid var(--c-border)",
          padding: "1.25rem 0.85rem",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--c-textSubtle)",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "0 0.5rem",
          }}
        >
          Workflows
        </h2>
        <WorkflowPicker workflows={workflows} selected={selectedId} onSelect={setSelectedId} />
      </div>

      <div style={{ flex: 1, padding: "1.5rem 2rem", overflowY: "auto" }}>
        {!selectedWorkflow ? (
          <div
            style={{
              color: "var(--c-textSubtle)",
              marginTop: "5rem",
              textAlign: "center",
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            Select a workflow to get started
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: "var(--c-text)" }}>
              {selectedWorkflow.name}
            </h1>
            <p style={{ color: "var(--c-textMuted)", fontSize: 14, marginBottom: 24 }}>
              {selectedWorkflow.description}
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginBottom: 20,
                maxWidth: 620,
              }}
            >
              {selectedWorkflow.parameters.map((p) => (
                <div key={p.name}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--c-textMuted)",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    {p.name.replace(/_/g, " ")}
                    {p.required && <span style={{ color: "var(--c-danger)", marginLeft: 4 }}>*</span>}
                    {p.description && (
                      <span style={{ color: "var(--c-textSubtle)", marginLeft: 8, fontWeight: 400 }}>
                        — {p.description}
                      </span>
                    )}
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
                background: loading ? "var(--c-border)" : "var(--c-accent)",
                border: "none",
                borderRadius: 10,
                color: loading ? "var(--c-textSubtle)" : "var(--c-accentFg)",
                padding: "0.65rem 1.4rem",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 24,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="cleanroom-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play size={14} />
                  Run Workflow
                </>
              )}
            </button>

            {error && (
              <div
                style={{
                  background: "var(--c-dangerSoft)",
                  border: "1px solid var(--c-danger)",
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  fontSize: 13,
                  color: "var(--c-danger)",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {result && (
              <div className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--c-textSubtle)" }}>
                    Generated in {(result.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--c-border)",
                      borderRadius: 8,
                      color: "var(--c-textMuted)",
                      padding: "4px 11px",
                      cursor: "pointer",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Copy size={11} />
                    Copy
                  </button>
                </div>
                <Markdown source={result.response} />
              </div>
            )}

            {history.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--c-textSubtle)",
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Recent Reports
                </h3>
                <div
                  style={{
                    background: "var(--c-bgElevated)",
                    border: "1px solid var(--c-border)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {history.slice(0, 10).map((run) => (
                    <div
                      key={run.id}
                      style={{
                        padding: "0.7rem 1rem",
                        borderBottom: "1px solid var(--c-border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 13,
                        cursor: "pointer",
                        color: "var(--c-text)",
                      }}
                      onClick={() => setSelectedId(run.workflow_id)}
                    >
                      <span>{run.workflow_id.replace(/_/g, " ")}</span>
                      <span style={{ color: "var(--c-textSubtle)", fontSize: 12 }}>
                        {new Date(run.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <style>{`@keyframes cleanroom-spin { to { transform: rotate(360deg) } } .cleanroom-spin { animation: cleanroom-spin 0.8s linear infinite; }`}</style>
      </div>
    </div>
  );
}
