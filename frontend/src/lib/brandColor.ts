"use client";

// Generates a brand-* shade scale (matching the app's default 50–950 steps) from a
// single hex color a Super Admin picks in Settings, then overrides the Tailwind utility
// classes actually used in this codebase (bg/text/border-brand-*) via an injected <style>
// tag — no rebuild required, and it's a no-op when no custom color is set.

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Lightness/saturation values sampled from the default palette in tailwind.config.ts, so
// a custom color gets the same tonal spread (light tint for badges, dark for text/hover).
const LIGHTNESS: Record<number, number> = { 50: 97, 100: 93, 200: 87, 300: 79, 400: 68, 500: 60, 600: 53, 700: 47, 800: 39, 900: 25, 950: 16 };
const SATURATION: Record<number, number> = { 50: 88, 100: 89, 200: 88, 300: 87, 400: 84, 500: 82, 600: 74, 700: 67, 800: 63, 900: 52, 950: 53 };

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100, lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Treats the picked color as the "600" stop (the shade used for solid buttons/the
 * logo), and derives the rest of the scale from it. */
export function generateBrandShades(hex: string): Record<number, string> {
  const [h, s] = hexToHsl(hex);
  const satScale = SATURATION[600] ? s / SATURATION[600] : 1;
  const shades: Record<number, string> = {};
  for (const stop of STOPS) {
    const stopSat = Math.min(100, Math.max(0, SATURATION[stop] * satScale));
    shades[stop] = hslToHex(h, stopSat, LIGHTNESS[stop]);
  }
  return shades;
}

const STYLE_TAG_ID = "brand-color-override";

/** Pass null/empty to remove any override and fall back to the default palette. */
export function applyBrandColor(hex: string | null | undefined) {
  const existing = document.getElementById(STYLE_TAG_ID);
  if (!hex) {
    existing?.remove();
    return;
  }
  const shades = generateBrandShades(hex);
  const esc = (cls: string) => cls.replace(/[:/]/g, (m) => `\\${m}`);
  // variant -> pseudo-class suffix appended to the selector (plain rules use "")
  const VARIANTS = ["", "hover:", "focus:"];
  const rules = STOPS.flatMap((stop) => {
    const c = shades[stop];
    return VARIANTS.flatMap((variant) => {
      const pseudo = variant ? `:${variant.replace(":", "")}` : "";
      return [
        ["bg", "background-color"],
        ["text", "color"],
        ["border", "border-color"],
        ["border-t", "border-top-color"],
      ].map(([prefix, prop]) => `.${esc(`${variant}${prefix}-brand-${stop}`)}${pseudo}{${prop}:${c} !important}`);
    });
  }).join("\n");

  let tag = existing as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = rules;
}
