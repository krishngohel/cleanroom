import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { TenantSettings } from "../api/client";

const DISMISS_KEY = "cleanroom_disclosure_seen_v1";

export default function ComplianceBanner({ settings }: { settings: TenantSettings }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!settings.require_disclosure_banner || dismissed) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: "var(--c-accentSoft)",
        border: "1px solid var(--c-border)",
        borderRadius: 10,
        padding: "0.55rem 0.8rem",
        margin: "0.75rem 1rem 0",
        fontSize: 12,
        color: "var(--c-text)",
      }}
    >
      <ShieldCheck size={14} style={{ color: "var(--c-accent)", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{settings.disclosure_text}</span>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
        }}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--c-textMuted)",
          cursor: "pointer",
          padding: 2,
          display: "inline-flex",
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ComplianceFooter({ settings }: { settings: TenantSettings }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderTop: "1px solid var(--c-border)",
        fontSize: 11,
        color: "var(--c-textSubtle)",
      }}
    >
      <ShieldCheck size={11} style={{ color: "var(--c-success)" }} />
      <span>
        Data residency: <strong style={{ color: "var(--c-textMuted)" }}>{settings.data_residency}</strong>
      </span>
      <span style={{ opacity: 0.5 }}>·</span>
      <div style={{ display: "flex", gap: 4 }}>
        {settings.compliance_frameworks.length === 0 && <span>No frameworks set</span>}
        {settings.compliance_frameworks.map((f) => (
          <span
            key={f}
            style={{
              background: "var(--c-bgSubtle)",
              border: "1px solid var(--c-border)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--c-text)",
            }}
          >
            {f}
          </span>
        ))}
      </div>
      {settings.dlp_enabled && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>DLP active</span>
        </>
      )}
    </div>
  );
}
