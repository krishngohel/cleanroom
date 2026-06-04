import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeProvider";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      style={{
        background: "transparent",
        border: "1px solid var(--c-border)",
        borderRadius: 8,
        color: "var(--c-textMuted)",
        padding: compact ? "6px 8px" : "6px 10px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        transition: "color 120ms, border-color 120ms",
      }}
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
      {!compact && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
