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
    bg: "#0b0d14",
    bgElevated: "#13161f",
    bgSubtle: "#181c28",
    bgInput: "#0e1119",
    bgOverlay: "rgba(11,13,20,0.85)",
    border: "#262b3a",
    borderStrong: "#39405a",
    text: "#e7e9f0",
    textMuted: "#9aa1b5",
    textSubtle: "#646b80",
    accent: "#7c9aff",
    accentHover: "#5d7ff5",
    accentFg: "#0b0d14",
    accentSoft: "rgba(124,154,255,0.13)",
    success: "#4ade80",
    warning: "#fbbf24",
    danger: "#f87171",
    dangerSoft: "rgba(239,68,68,0.12)",
    codeBg: "#0e1119",
    codeText: "#e7e9f0",
    shadow: "0 12px 36px rgba(0,0,0,0.5)",
  },
  light: {
    bg: "#f7f8fb",
    bgElevated: "#ffffff",
    bgSubtle: "#eef0f6",
    bgInput: "#ffffff",
    bgOverlay: "rgba(255,255,255,0.92)",
    border: "#e3e6ee",
    borderStrong: "#c8cdda",
    text: "#171a23",
    textMuted: "#4d5566",
    textSubtle: "#717a8e",
    accent: "#4361ee",
    accentHover: "#3650d0",
    accentFg: "#ffffff",
    accentSoft: "rgba(67,97,238,0.10)",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    dangerSoft: "rgba(220,38,38,0.10)",
    codeBg: "#171a23",
    codeText: "#e7e9f0",
    shadow: "0 12px 36px rgba(23,26,35,0.10)",
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
