export type ThemeName = "light" | "dark";

export interface ThemeTokens {
  bg: string;
  bgElevated: string;
  bgSubtle: string;
  bgInput: string;
  bgOverlay: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  codeBg: string;
  codeText: string;
  shadow: string;
}

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    bg: "#0f172a",
    bgElevated: "#1e293b",
    bgSubtle: "#172033",
    bgInput: "#0b1220",
    bgOverlay: "rgba(15,23,42,0.85)",
    border: "#334155",
    borderStrong: "#475569",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    textSubtle: "#64748b",
    accent: "#38bdf8",
    accentHover: "#0ea5e9",
    accentFg: "#0b1220",
    accentSoft: "rgba(56,189,248,0.12)",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    dangerSoft: "rgba(239,68,68,0.12)",
    codeBg: "#0b1220",
    codeText: "#e2e8f0",
    shadow: "0 10px 30px rgba(0,0,0,0.45)",
  },
  light: {
    bg: "#f8fafc",
    bgElevated: "#ffffff",
    bgSubtle: "#f1f5f9",
    bgInput: "#ffffff",
    bgOverlay: "rgba(255,255,255,0.92)",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#475569",
    textSubtle: "#64748b",
    accent: "#0284c7",
    accentHover: "#0369a1",
    accentFg: "#ffffff",
    accentSoft: "rgba(2,132,199,0.10)",
    success: "#059669",
    warning: "#d97706",
    danger: "#dc2626",
    dangerSoft: "rgba(220,38,38,0.10)",
    codeBg: "#0f172a",
    codeText: "#e2e8f0",
    shadow: "0 10px 30px rgba(15,23,42,0.08)",
  },
};

export function applyTheme(name: ThemeName) {
  const t = themes[name];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t)) {
    root.style.setProperty(`--c-${k}`, v);
  }
  root.setAttribute("data-theme", name);
  document.body.style.background = t.bg;
  document.body.style.color = t.text;
}
