import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, Gauge, MemoryStick, RefreshCw, Zap } from "lucide-react";
import { api } from "../api/client";
import type { HardwareStatus } from "../api/client";

const card: React.CSSProperties = {
  background: "var(--c-bgElevated)",
  border: "1px solid var(--c-border)",
  borderRadius: 14,
  padding: "1.1rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const statRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--c-textMuted)",
};

/**
 * Hardware → model auto-configuration card.
 * Shows what was detected, which model was chosen and why, and (for admins)
 * override + pull controls.
 */
export default function HardwareCard({ admin = false }: { admin?: boolean }) {
  const [hw, setHw] = useState<HardwareStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHw(await api.hardware.status());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hardware status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while a pull is in progress.
  useEffect(() => {
    if (hw?.pull?.state !== "pulling") return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [hw?.pull?.state, load]);

  const setModel = async (model: string | null) => {
    setBusy(true);
    try {
      await api.hardware.setModel(model);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set model");
    } finally {
      setBusy(false);
    }
  };

  const pull = async (model: string) => {
    setBusy(true);
    try {
      await api.hardware.pull(model);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start pull");
    } finally {
      setBusy(false);
    }
  };

  if (error && !hw) {
    return <div style={card}>{error}</div>;
  }
  if (!hw) {
    return <div style={card}>Detecting hardware…</div>;
  }

  const h = hw.hardware;
  const rec = hw.recommendation;
  const recommendedInstalled =
    rec != null &&
    hw.installed.some((m) => m === rec.model || m.split(":")[0] === rec.model.split(":")[0]);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
          <Gauge size={16} style={{ color: "var(--c-accent)" }} />
          Auto-configured model
        </div>
        {admin && (
          <button
            onClick={() => void api.hardware.refresh().then(() => load())}
            title="Re-detect hardware"
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-textMuted)",
              padding: "4px 8px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <RefreshCw size={12} /> Re-detect
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--c-text)" }}>
          {hw.active_model}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: hw.override ? "var(--c-dangerSoft)" : "var(--c-accentSoft)",
            color: hw.override ? "var(--c-danger)" : "var(--c-accent)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {hw.override ? "manual override" : rec?.mode === "gpu" ? "auto · GPU" : "auto · CPU"}
        </span>
      </div>

      {rec && (
        <div style={{ fontSize: 12.5, color: "var(--c-textMuted)", lineHeight: 1.5 }}>
          {rec.reason}
        </div>
      )}

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {h && h.gpus.length > 0 ? (
          <div style={statRow}>
            <Zap size={13} style={{ color: "var(--c-success)" }} />
            {h.gpus.map((g) => g.name).join(", ")} · {h.total_vram_gb} GB VRAM
          </div>
        ) : (
          <div style={statRow}>
            <Zap size={13} style={{ color: "var(--c-warning)" }} /> No GPU detected
          </div>
        )}
        <div style={statRow}>
          <MemoryStick size={13} /> {h ? `${h.ram_gb} GB RAM` : "RAM unknown"}
        </div>
        <div style={statRow}>
          <Cpu size={13} /> {h ? `${h.cpu_cores} cores` : "CPU unknown"}
        </div>
      </div>

      {hw.pull.state === "pulling" && (
        <div style={{ fontSize: 12.5, color: "var(--c-accent)" }}>
          Downloading {hw.pull.model}… {hw.pull.percent ?? 0}%
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: "var(--c-bgSubtle)",
              marginTop: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${hw.pull.percent ?? 0}%`,
                height: "100%",
                background: "var(--c-accent)",
                transition: "width 600ms ease",
              }}
            />
          </div>
        </div>
      )}
      {hw.pull.state === "error" && (
        <div style={{ fontSize: 12.5, color: "var(--c-danger)" }}>
          Pull failed: {hw.pull.error}
        </div>
      )}

      {admin && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            disabled={busy}
            value={hw.override ?? "auto"}
            onChange={(e) => void setModel(e.target.value === "auto" ? null : e.target.value)}
            style={{
              background: "var(--c-bgInput)",
              color: "var(--c-text)",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12.5,
            }}
          >
            <option value="auto">Automatic (recommended)</option>
            {hw.catalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.best_for}
              </option>
            ))}
          </select>
          {rec && !recommendedInstalled && hw.pull.state !== "pulling" && (
            <button
              disabled={busy}
              onClick={() => void pull(rec.model)}
              style={{
                background: "var(--c-accent)",
                color: "var(--c-accentFg)",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Download size={13} /> Pull {rec.label}
            </button>
          )}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--c-danger)" }}>{error}</div>}
    </div>
  );
}
