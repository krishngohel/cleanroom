import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDashed,
  FileText,
  Globe,
  History,
  Loader2,
  Play,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import { api } from "../api/client";
import type {
  AgentEvent,
  AgentRunSummary,
  ScheduledTaskItem,
} from "../api/client";
import type { Workspace } from "../types";
import Markdown from "../components/Markdown";

// ── Types for the live view ───────────────────────────────────────────────────

interface PlanStep {
  text: string;
  status: "pending" | "in_progress" | "done";
}

interface ActivityItem {
  kind: "call" | "result" | "error";
  tool?: string;
  text: string;
  ok?: boolean;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  fetch_page: <Globe size={13} />,
  find_in_page: <Search size={13} />,
  http_request: <Globe size={13} />,
  read_file: <FileText size={13} />,
  write_file: <FileText size={13} />,
  list_files: <FileText size={13} />,
  search_files: <Search size={13} />,
};

const panel: React.CSSProperties = {
  background: "var(--c-bgElevated)",
  border: "1px solid var(--c-border)",
  borderRadius: 14,
  padding: "1rem 1.1rem",
};

const SUGGESTIONS = [
  "Summarize every document in the workspace into a one-page brief saved as summary.md",
  "Open the HR policy page on the intranet and answer: how many vacation days do new hires get?",
  "Review the contracts in this workspace and list any missing signature blocks",
  "Run the financial summary workflow and save the result to reports/q2.md",
];

export default function Agent() {
  // Composer
  const [prompt, setPrompt] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");

  // Live run state
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [answer, setAnswer] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  // Sidebar data
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [schedules, setSchedules] = useState<ScheduledTaskItem[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedName, setSchedName] = useState("");
  const [schedTime, setSchedTime] = useState("08:00");

  const loadSidebar = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.agent.runs(), api.scheduled.list()]);
      setRuns(r);
      setSchedules(s);
    } catch {
      /* sidebar is non-critical */
    }
  }, []);

  useEffect(() => {
    void loadSidebar();
    api.code
      .listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, [loadSidebar]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [activity, answer]);

  const handleEvent = (e: AgentEvent) => {
    switch (e.type) {
      case "plan":
        setPlan(e.steps.map((text) => ({ text, status: "pending" })));
        break;
      case "task_update":
        setPlan((prev) =>
          prev.map((s, i) => (i === e.index ? { ...s, status: e.status } : s)),
        );
        break;
      case "tool_call":
        setActivity((prev) => [
          ...prev,
          { kind: "call", tool: e.tool, text: e.args_summary },
        ]);
        break;
      case "tool_result":
        setActivity((prev) => [
          ...prev,
          { kind: "result", tool: e.tool, text: e.preview, ok: e.ok },
        ]);
        break;
      case "answer":
        setAnswer(e.text);
        break;
      case "files":
        setFiles(e.paths);
        break;
      case "error":
        setError(e.message);
        break;
      default:
        break;
    }
  };

  const run = async (text?: string) => {
    const p = (text ?? prompt).trim();
    if (!p || running) return;
    setRunning(true);
    setPlan([]);
    setActivity([]);
    setAnswer("");
    setFiles([]);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.agent.run(
        p,
        { workspaceId: workspaceId || null },
        handleEvent,
        controller.signal,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "Agent run failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      void loadSidebar();
    }
  };

  const stop = () => abortRef.current?.abort();

  const openRun = async (id: string) => {
    try {
      const detail = await api.agent.getRun(id);
      setPrompt(detail.prompt);
      setPlan([]);
      setActivity([]);
      setAnswer("");
      setFiles([]);
      setError(null);
      for (const e of detail.events) handleEvent(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    }
  };

  const createSchedule = async () => {
    if (!schedName.trim() || !prompt.trim()) return;
    try {
      await api.scheduled.create({
        name: schedName.trim(),
        prompt: prompt.trim(),
        schedule_kind: "daily",
        interval_minutes: 1440,
        daily_time: schedTime,
        enabled: true,
        workspace_id: workspaceId || null,
      });
      setShowSchedule(false);
      setSchedName("");
      void loadSidebar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule task");
    }
  };

  const hasOutput = plan.length > 0 || activity.length > 0 || answer || error;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Main column ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "1.25rem 1.5rem",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "var(--c-accentSoft)",
              display: "grid",
              placeItems: "center",
              color: "var(--c-accent)",
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Agent</div>
            <div style={{ fontSize: 12, color: "var(--c-textSubtle)" }}>
              Delegates whole tasks — plans, uses tools, and reports back. Every action audited.
            </div>
          </div>
        </div>

        {/* Composer */}
        <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
            }}
            placeholder="Describe a task… e.g. “Read every contract in this workspace and flag missing signature blocks, then save a report.”"
            rows={3}
            style={{
              width: "100%",
              resize: "vertical",
              background: "var(--c-bgInput)",
              color: "var(--c-text)",
              border: "1px solid var(--c-border)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13.5,
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={{
                background: "var(--c-bgInput)",
                color: "var(--c-text)",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12.5,
              }}
            >
              <option value="">No workspace (web & workflows only)</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  📁 {w.name}
                </option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowSchedule((s) => !s)}
              title="Run this prompt on a schedule"
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: "var(--c-textMuted)",
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CalendarClock size={13} /> Schedule
            </button>
            {running ? (
              <button
                onClick={stop}
                style={{
                  background: "var(--c-dangerSoft)",
                  border: "1px solid var(--c-danger)",
                  borderRadius: 8,
                  color: "var(--c-danger)",
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Square size={12} /> Stop
              </button>
            ) : (
              <button
                onClick={() => void run()}
                disabled={!prompt.trim()}
                style={{
                  background: prompt.trim() ? "var(--c-accent)" : "var(--c-bgSubtle)",
                  border: "none",
                  borderRadius: 8,
                  color: prompt.trim() ? "var(--c-accentFg)" : "var(--c-textSubtle)",
                  padding: "7px 16px",
                  cursor: prompt.trim() ? "pointer" : "default",
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Send size={13} /> Run task
              </button>
            )}
          </div>

          {showSchedule && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                borderTop: "1px solid var(--c-border)",
                paddingTop: 10,
              }}
            >
              <input
                value={schedName}
                onChange={(e) => setSchedName(e.target.value)}
                placeholder="Schedule name (e.g. Morning digest)"
                style={{
                  flex: 1,
                  minWidth: 180,
                  background: "var(--c-bgInput)",
                  color: "var(--c-text)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 12.5,
                }}
              />
              <span style={{ fontSize: 12.5, color: "var(--c-textMuted)" }}>daily at</span>
              <input
                type="time"
                value={schedTime}
                onChange={(e) => setSchedTime(e.target.value)}
                style={{
                  background: "var(--c-bgInput)",
                  color: "var(--c-text)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12.5,
                }}
              />
              <button
                onClick={() => void createSchedule()}
                disabled={!schedName.trim() || !prompt.trim()}
                style={{
                  background: "var(--c-accent)",
                  color: "var(--c-accentFg)",
                  border: "none",
                  borderRadius: 8,
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={13} /> Create
              </button>
            </div>
          )}
        </div>

        {/* Output area */}
        <div
          ref={feedRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            paddingBottom: 20,
          }}
        >
          {!hasOutput && !running && (
            <div style={{ ...panel, color: "var(--c-textMuted)", fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--c-text)" }}>
                Try asking the agent to…
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: "var(--c-textMuted)",
                    padding: "7px 4px",
                    cursor: "pointer",
                    fontSize: 12.5,
                    borderRadius: 6,
                  }}
                >
                  <ChevronRight size={13} style={{ flexShrink: 0, color: "var(--c-accent)" }} />
                  {s}
                </button>
              ))}
            </div>
          )}

          {plan.length > 0 && (
            <div style={panel}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Task list</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.map((s, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}
                  >
                    {s.status === "done" ? (
                      <Check size={14} style={{ color: "var(--c-success)", flexShrink: 0 }} />
                    ) : s.status === "in_progress" ? (
                      <Loader2
                        size={14}
                        className="spin"
                        style={{ color: "var(--c-accent)", flexShrink: 0 }}
                      />
                    ) : (
                      <CircleDashed
                        size={14}
                        style={{ color: "var(--c-textSubtle)", flexShrink: 0 }}
                      />
                    )}
                    <span
                      style={{
                        color:
                          s.status === "done"
                            ? "var(--c-textSubtle)"
                            : s.status === "in_progress"
                              ? "var(--c-text)"
                              : "var(--c-textMuted)",
                        textDecoration: s.status === "done" ? "line-through" : "none",
                      }}
                    >
                      {s.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activity.length > 0 && (
            <div style={panel}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Activity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activity.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 12.5,
                      alignItems: "flex-start",
                      color:
                        a.kind === "result" && a.ok === false
                          ? "var(--c-danger)"
                          : a.kind === "call"
                            ? "var(--c-text)"
                            : "var(--c-textMuted)",
                    }}
                  >
                    <span style={{ flexShrink: 0, marginTop: 2, color: "var(--c-accent)" }}>
                      {a.kind === "call" ? (
                        (a.tool && TOOL_ICONS[a.tool]) || <Wrench size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </span>
                    <span style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                      {a.kind === "call" ? (
                        <>
                          <strong>{a.tool}</strong>
                          {a.text ? ` — ${a.text}` : ""}
                        </>
                      ) : (
                        a.text
                      )}
                    </span>
                  </div>
                ))}
                {running && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 12.5,
                      color: "var(--c-textSubtle)",
                    }}
                  >
                    <Loader2 size={13} className="spin" /> working…
                  </div>
                )}
              </div>
            </div>
          )}

          {answer && (
            <div style={{ ...panel, borderColor: "var(--c-accent)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--c-accent)" }}>
                Result
              </div>
              <Markdown source={answer} />
              {files.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid var(--c-border)",
                    fontSize: 12.5,
                    color: "var(--c-textMuted)",
                  }}
                >
                  Files written:{" "}
                  {files.map((f) => (
                    <code
                      key={f}
                      style={{
                        background: "var(--c-bgSubtle)",
                        borderRadius: 6,
                        padding: "2px 6px",
                        marginRight: 6,
                      }}
                    >
                      {f}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ ...panel, borderColor: "var(--c-danger)", color: "var(--c-danger)", fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Right rail: history + schedules ─────────────────────────── */}
      <div
        style={{
          width: 280,
          borderLeft: "1px solid var(--c-border)",
          padding: "1.25rem 1rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontWeight: 700,
              fontSize: 12.5,
              marginBottom: 8,
              color: "var(--c-textMuted)",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            <CalendarClock size={13} /> Schedules
          </div>
          {schedules.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--c-textSubtle)" }}>
              None yet — write a prompt and press Schedule.
            </div>
          )}
          {schedules.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--c-border)",
                marginBottom: 7,
                fontSize: 12.5,
              }}
            >
              <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button
                    title="Run now"
                    onClick={() => void api.scheduled.runNow(s.id).then(() => loadSidebar())}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-accent)", padding: 0 }}
                  >
                    <Play size={12} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => void api.scheduled.remove(s.id).then(() => loadSidebar())}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-textSubtle)", padding: 0 }}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
              <div style={{ color: "var(--c-textSubtle)", fontSize: 11.5 }}>
                daily {s.daily_time}
                {s.last_status ? ` · last: ${s.last_status}` : ""}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontWeight: 700,
              fontSize: 12.5,
              marginBottom: 8,
              color: "var(--c-textMuted)",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            <History size={13} /> Recent runs
          </div>
          {runs.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--c-textSubtle)" }}>No runs yet.</div>
          )}
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => void openRun(r.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--c-border)",
                background: "transparent",
                color: "var(--c-text)",
                marginBottom: 7,
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {r.prompt}
              </div>
              <div style={{ color: "var(--c-textSubtle)", fontSize: 11.5 }}>
                {new Date(r.created_at).toLocaleString()} ·{" "}
                <span
                  style={{
                    color:
                      r.status === "completed"
                        ? "var(--c-success)"
                        : r.status === "error"
                          ? "var(--c-danger)"
                          : "var(--c-warning)",
                  }}
                >
                  {r.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
