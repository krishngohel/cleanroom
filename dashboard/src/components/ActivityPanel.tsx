import { useEffect, useState } from "react";
import { Activity, Cpu, FileText, ShieldAlert, Timer } from "lucide-react";

export interface ActivityState {
  /** "idle" → nothing happening · "thinking" → request inflight, waiting on first token · "streaming" → tokens arriving · "done" → final */
  phase: "idle" | "thinking" | "streaming" | "done" | "error";
  startedAt: number | null;
  firstTokenAt: number | null;
  endedAt: number | null;
  model: string;
  inputChars: number;
  outputChars: number;
  attachmentBytes: number;
  projectContextBytes: number;
  redactionCount: number;
  /** A short label updated as work happens (e.g., "Loading project knowledge…") */
  step: string;
}

export const initialActivity: ActivityState = {
  phase: "idle",
  startedAt: null,
  firstTokenAt: null,
  endedAt: null,
  model: "",
  inputChars: 0,
  outputChars: 0,
  attachmentBytes: 0,
  projectContextBytes: 0,
  redactionCount: 0,
  step: "Idle",
};

function formatBytes(b: number): string {
  if (b <= 0) return "0";
  if (b < 1024) return `${b}`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}K`;
  return `${(b / (1024 * 1024)).toFixed(1)}M`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function Tick({ active, label, color }: { active: boolean; label: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 8,
        background: active ? color + "20" : "transparent",
        color: active ? color : "var(--c-textSubtle)",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        transition: "background-color 160ms, color 160ms",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          opacity: active ? 1 : 0.3,
          boxShadow: active ? `0 0 0 4px ${color}33` : "none",
          transition: "box-shadow 160ms, opacity 160ms",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

export default function ActivityPanel({ state }: { state: ActivityState }) {
  // Ticking clock so elapsed time animates during streaming.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state.phase === "thinking" || state.phase === "streaming") {
      const id = setInterval(() => setNow(Date.now()), 100);
      return () => clearInterval(id);
    }
    setNow(state.endedAt ?? Date.now());
    return undefined;
  }, [state.phase, state.endedAt]);

  const totalElapsed = state.startedAt
    ? (state.endedAt ?? now) - state.startedAt
    : 0;
  const ttft =
    state.startedAt && state.firstTokenAt
      ? state.firstTokenAt - state.startedAt
      : null;
  const streamingMs =
    state.firstTokenAt
      ? (state.endedAt ?? now) - state.firstTokenAt
      : null;

  const tokensApprox = Math.ceil(state.outputChars / 4);
  const tps =
    streamingMs && streamingMs > 200 && tokensApprox > 0
      ? Math.round(tokensApprox / (streamingMs / 1000))
      : null;

  return (
    <div
      style={{
        background: "var(--c-bgElevated)",
        border: "1px solid var(--c-border)",
        borderRadius: 14,
        padding: "0.85rem 0.95rem",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Active accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: 2,
          background:
            state.phase === "streaming"
              ? "var(--c-accent)"
              : state.phase === "thinking"
              ? "var(--c-warning)"
              : state.phase === "error"
              ? "var(--c-danger)"
              : "var(--c-success)",
          width:
            state.phase === "streaming" || state.phase === "thinking" ? "100%" : "0%",
          opacity: state.phase === "thinking" || state.phase === "streaming" ? 1 : 0.3,
          transition: "width 200ms, background 160ms",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--c-textSubtle)",
        }}
      >
        <Activity size={12} />
        <span>Live activity</span>
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Tick
          active={state.phase === "thinking"}
          label={
            state.phase === "thinking"
              ? state.step || "Preparing request…"
              : "Build context"
          }
          color="var(--c-warning)"
        />
        <Tick
          active={state.phase === "streaming"}
          label={state.phase === "streaming" ? "Streaming response" : "Generate"}
          color="var(--c-accent)"
        />
        <Tick
          active={state.phase === "done"}
          label={state.phase === "done" ? "Complete" : "Idle"}
          color="var(--c-success)"
        />
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          fontSize: 11.5,
        }}
      >
        <Stat icon={<Timer size={11} />} label="Elapsed">
          {state.startedAt ? formatElapsed(totalElapsed) : "—"}
        </Stat>
        <Stat icon={<Timer size={11} />} label="First token">
          {ttft != null ? formatElapsed(ttft) : "—"}
        </Stat>
        <Stat icon={<Cpu size={11} />} label="Tokens out (~)">
          {tokensApprox > 0 ? tokensApprox.toLocaleString() : "—"}
        </Stat>
        <Stat icon={<Cpu size={11} />} label="Speed">
          {tps != null ? `${tps} tok/s` : "—"}
        </Stat>
        <Stat icon={<FileText size={11} />} label="Project ctx">
          {formatBytes(state.projectContextBytes)} B
        </Stat>
        <Stat icon={<FileText size={11} />} label="Attached">
          {formatBytes(state.attachmentBytes)} B
        </Stat>
      </div>

      {state.redactionCount > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            color: "var(--c-warning)",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 8,
            padding: "5px 8px",
          }}
        >
          <ShieldAlert size={11} />
          DLP redacted {state.redactionCount} item{state.redactionCount === 1 ? "" : "s"} before send
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: "var(--c-textSubtle)",
          paddingTop: 4,
          borderTop: "1px solid var(--c-border)",
        }}
      >
        Model: <span style={{ color: "var(--c-textMuted)" }}>{state.model || "—"}</span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--c-bgSubtle)",
        border: "1px solid var(--c-border)",
        borderRadius: 8,
        padding: "6px 8px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--c-textSubtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 2,
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)" }}>{children}</div>
    </div>
  );
}
