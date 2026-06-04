import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ThemeName } from "./tokens";

interface TenantBrand {
  brand_name: string;
  default_theme: ThemeName;
  allow_theme_toggle: boolean;
  accent_color: string | null;
  logo_url: string | null;
}

const CACHE_KEY = "cleanroom_tenant_brand";

function readCached(): TenantBrand | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as TenantBrand) : null;
  } catch {
    return null;
  }
}

export function useTenantBrand(): TenantBrand {
  const [brand, setBrand] = useState<TenantBrand>(
    () =>
      readCached() ?? {
        brand_name: "Cleanroom AI",
        default_theme: "dark",
        allow_theme_toggle: true,
        accent_color: null,
        logo_url: null,
      },
  );

  useEffect(() => {
    api.tenant
      .getPublic()
      .then((b) => {
        setBrand(b);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(b));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* ignore — fall back to cached/default */
      });
  }, []);

  return brand;
}
