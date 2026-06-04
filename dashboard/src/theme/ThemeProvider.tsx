import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { applyTheme, themes } from "./tokens";
import type { ThemeName, ThemeTokens } from "./tokens";

const USER_KEY = "cleanroom_theme_user";

interface ThemeContextValue {
  theme: ThemeName;
  tokens: ThemeTokens;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
  setTenantDefault: (t: ThemeName) => void;
  hasUserOverride: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readUserOverride(): ThemeName | null {
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: ReactNode;
  defaultTheme?: ThemeName;
}) {
  const [tenantDefault, setTenantDefault] = useState<ThemeName>(defaultTheme);
  const [override, setOverride] = useState<ThemeName | null>(() => readUserOverride());

  const theme: ThemeName = override ?? tenantDefault;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => {
    setOverride(t);
    try {
      localStorage.setItem(USER_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const cur = prev ?? "dark";
      const next: ThemeName = cur === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(USER_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      tokens: themes[theme],
      setTheme,
      toggle,
      setTenantDefault,
      hasUserOverride: override !== null,
    }),
    [theme, setTheme, toggle, override],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
