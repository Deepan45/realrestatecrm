"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export interface Branding {
  appName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

const DEFAULTS: Branding = { appName: "RealRest", tagline: "Real Estate CRM", logoUrl: null, primaryColor: null };

/** Settings → Branding lets a Super Admin customize the app name, tagline, logo, and
 * accent color shown in the dashboard sidebar (and browser tab) — stored under the
 * generic "branding" settings key, same pattern as useCurrencies. */
export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  useEffect(() => {
    api
      .get<{ data: Record<string, unknown> }>("/settings")
      .then((r) => {
        const b = r.data.branding as Partial<Branding> | undefined;
        if (b && typeof b === "object") setBranding({ ...DEFAULTS, ...b });
      })
      .catch(() => {});
  }, []);
  return branding;
}
