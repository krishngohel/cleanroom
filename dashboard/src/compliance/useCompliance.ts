import { useCallback, useEffect, useState } from "react";
import { api, type TenantSettings } from "../api/client";

const CACHE_KEY = "cleanroom_compliance_v1";

function readCached(): TenantSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as TenantSettings) : null;
  } catch {
    return null;
  }
}

const FALLBACK: TenantSettings = {
  brand_name: "Cleanroom Cowork",
  default_theme: "dark",
  allow_theme_toggle: true,
  accent_color: null,
  logo_url: null,
  overlay_enabled: true,
  compliance_frameworks: ["SOC2"],
  data_residency: "on-prem",
  audit_retention_days: 365,
  require_disclosure_banner: true,
  disclosure_text:
    "Conversations are logged for compliance and audit. Your data stays inside your organization's network.",
  dlp_enabled: true,
  dlp_patterns: [],
  assistant_dock_enabled: true,
  computer_control_enabled: false,
  agent_socket_url: "ws://127.0.0.1:9777",
  require_action_confirmation: true,
};

export function useCompliance(): { settings: TenantSettings; refresh: () => void } {
  const [settings, setSettings] = useState<TenantSettings>(() => readCached() ?? FALLBACK);

  const refresh = useCallback(() => {
    api.tenant
      .get()
      .then((s) => {
        setSettings(s);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(s));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* keep cached value */
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, refresh };
}
