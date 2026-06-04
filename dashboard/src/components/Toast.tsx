import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Kind = "success" | "error" | "info";

interface Toast {
  id: string;
  kind: Kind;
  message: string;
}

interface ToastContextValue {
  push: (kind: Kind, message: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const accentFor: Record<Kind, string> = {
  success: "var(--c-success)",
  error: "var(--c-danger)",
  info: "var(--c-accent)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Kind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((p) => [...p, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value: ToastContextValue = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              background: "var(--c-bgElevated)",
              border: `1px solid var(--c-border)`,
              borderLeft: `3px solid ${accentFor[t.kind]}`,
              borderRadius: 10,
              padding: "10px 14px 10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 260,
              maxWidth: 380,
              color: "var(--c-text)",
              fontSize: 13,
              boxShadow: "var(--c-shadow)",
            }}
          >
            <span style={{ color: accentFor[t.kind], display: "inline-flex" }}>
              {t.kind === "success" ? <CheckCircle2 size={16} /> : t.kind === "error" ? <AlertCircle size={16} /> : <Info size={16} />}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--c-textMuted)",
                cursor: "pointer",
                padding: 0,
                display: "inline-flex",
              }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
