import { useId } from "react";
/** Line icons for the landing page (24px grid, 1.8px stroke, round joins). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Icon = {
  voice: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12z" />
    </svg>
  ),
  window: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" />
      <rect x="11" y="6.5" width="8" height="5" rx="1.5" />
    </svg>
  ),
  glasses: (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="6.5" cy="14" r="3.8" />
      <circle cx="17.5" cy="14" r="3.8" />
      <path d="M10.3 13.6a2 2 0 0 1 3.4 0M2.7 13 4 7.5M21.3 13 20 7.5" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 2.8 4.5 5.6v6c0 4.7 3.2 8.2 7.5 9.6 4.3-1.4 7.5-4.9 7.5-9.6v-6z" />
      <path d="m8.8 12 2.2 2.2 4.4-4.4" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3.5 20.5h17M6.5 16.5v-4M11 16.5V8M15.5 16.5v-6M20 16.5V5" />
    </svg>
  ),
  hand: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-5.5V4a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V13a7.5 7.5 0 0 1-7.5 7.5c-2.4 0-4.3-1.2-5.6-3.3L3 13.4a1.5 1.5 0 0 1 2.6-1.5L8 15" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" {...P} strokeWidth={2.4}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z" />
    </svg>
  ),
  android: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 9.4 19 6.8a.5.5 0 0 0-.9-.5l-1.5 2.6a9.6 9.6 0 0 0-9.2 0L5.9 6.3a.5.5 0 0 0-.9.5l1.5 2.6A8.4 8.4 0 0 0 3 16h18a8.4 8.4 0 0 0-3.5-6.6zM8 13.3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5a10.5 10.5 0 0 0-3.3 20.47c.52.1.72-.23.72-.5v-1.8c-2.92.64-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.54-1.17-1.54-.95-.65.08-.64.08-.64 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.2 0-1.14.41-2.08 1.08-2.81-.11-.27-.47-1.33.1-2.78 0 0 .88-.28 2.89 1.07a10 10 0 0 1 5.26 0c2-1.35 2.88-1.07 2.88-1.07.58 1.45.22 2.51.11 2.78.67.73 1.08 1.67 1.08 2.81 0 4.04-2.46 4.93-4.8 5.19.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3zM9.5 9.75h3.8v1.6h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.65 4.77 6.1V21h-4v-4.95c0-1.18-.02-2.7-1.65-2.7-1.65 0-1.9 1.29-1.9 2.62V21h-4z" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};

/** A softly lit head-and-shoulders silhouette (no cartoon faces). */
export function Silhouette({ className = "" }: { className?: string }) {
  return (
    <svg className={`silhouette ${className}`} viewBox="0 0 200 160" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <radialGradient id="sil-fill" cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor="#3a2a30" />
          <stop offset="1" stopColor="#120c10" />
        </radialGradient>
        <linearGradient id="sil-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff8a3d" stopOpacity=".9" />
          <stop offset=".5" stopColor="#ff8a3d" stopOpacity="0" />
          <stop offset="1" stopColor="#ff4d6d" stopOpacity=".8" />
        </linearGradient>
      </defs>
      <path
        d="M100 18c19 0 32 15 32 35 0 14-6 26-15 32l2 9c26 6 49 20 57 46v20H24v-20c8-26 31-40 57-46l2-9c-9-6-15-18-15-32 0-20 13-35 32-35z"
        fill="url(#sil-fill)"
        stroke="url(#sil-rim)"
        strokeWidth="2"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Feature icons: SF Symbols-style line art on a 48px grid, stroked with a two-colour gradient.
 * ---------------------------------------------------------------------------------------------- */

export type Hue = "rose" | "sun" | "violet" | "sky" | "mint";
const HUES: Record<Hue, [string, string]> = {
  rose: ["#ff3d77", "#ff9a3d"],
  sun: ["#ff8a3d", "#ffd23c"],
  violet: ["#b65cff", "#ff4d9d"],
  sky: ["#2f8bff", "#3de0ff"],
  mint: ["#22d39b", "#b8f55a"],
};

const PRO_PATHS = {
  voice: (
    <>
      <rect x="18.5" y="5" width="11" height="22" rx="5.5" />
      <path d="M11 22.5a13 13 0 0 0 26 0M24 35.5V43M17 43h14" />
      <path d="M4 19v7M43.5 17v11" />
    </>
  ),
  sparkles: (
    <>
      <path d="M21 8c1.3 7.6 4.9 11.2 12.5 12.5C25.9 21.8 22.3 25.4 21 33c-1.3-7.6-4.9-11.2-12.5-12.5C16.1 19.2 19.7 15.6 21 8z" />
      <path d="M36 29c.7 3.8 2.4 5.5 6.2 6.2-3.8.7-5.5 2.4-6.2 6.2-.7-3.8-2.4-5.5-6.2-6.2 3.8-.7 5.5-2.4 6.2-6.2z" />
      <path d="M36.5 5.5v6M33.5 8.5h6" />
    </>
  ),
  pip: (
    <>
      <rect x="4" y="8" width="40" height="32" rx="6" />
      <rect x="23" y="13" width="16" height="11" rx="3" />
      <path d="M10 33h9" />
    </>
  ),
  glasses: (
    <>
      <path d="M4 26h40" />
      <rect x="5" y="22" width="15" height="13" rx="6.5" />
      <rect x="28" y="22" width="15" height="13" rx="6.5" />
      <path d="M20 26.5a5 5 0 0 1 8 0" />
      <path d="M24 5v4M12.5 9.5l2.6 2.6M35.5 9.5l-2.6 2.6" />
    </>
  ),
  eye: (
    <>
      <path d="M3.5 24S11 11 24 11s20.5 13 20.5 13S37 37 24 37 3.5 24 3.5 24z" />
      <circle cx="24" cy="24" r="7" />
      <circle cx="21.8" cy="21.8" r="1.2" />
    </>
  ),
  shield: (
    <>
      <path d="M24 4.5 9 10v11.5c0 9.6 6.3 16.8 15 20 8.7-3.2 15-10.4 15-20V10z" />
      <path d="m17 23.5 5 5 9-10" />
    </>
  ),
  gauge: (
    <>
      <path d="M7.5 34a18 18 0 1 1 33 0" />
      <path d="m24 31 8-11" />
      <circle cx="24" cy="31" r="2.6" />
      <path d="M12 23.5h2.5M33.5 23.5H36M24 11.5V14M15.5 15l1.8 1.8" />
    </>
  ),
  hand: (
    <>
      <path d="M15 25V11a3 3 0 0 1 6 0v11M21 21V7.5a3 3 0 0 1 6 0V21M27 21V10a3 3 0 0 1 6 0v13" />
      <path d="M33 23v-4a3 3 0 0 1 6 0v9c0 9-6.5 15.5-15.5 15.5h-1.5c-5 0-8.7-2.3-11.4-6.3l-5.4-8a3 3 0 0 1 4.9-3.4L15 30" />
    </>
  ),
  lock: (
    <>
      <rect x="9" y="21" width="30" height="22" rx="5" />
      <path d="M15.5 21v-5.5a8.5 8.5 0 0 1 17 0V21" />
      <path d="M24 30v5" />
    </>
  ),
  globe: (
    <>
      <circle cx="24" cy="24" r="19" />
      <path d="M5 24h38M24 5c5.5 5.2 8 11.5 8 19s-2.5 13.8-8 19c-5.5-5.2-8-11.5-8-19s2.5-13.8 8-19z" />
      <path d="M8.5 14.5h31M8.5 33.5h31" />
    </>
  ),
  camera: (
    <>
      <rect x="4" y="12" width="28" height="24" rx="6" />
      <path d="m32 21 10-6v18l-10-6" />
    </>
  ),
};
export type ProIconName = keyof typeof PRO_PATHS;

export function ProIcon({ name, hue, size = 56 }: { name: ProIconName; hue: Hue; size?: number }) {
  const id = `pi-${useId().replace(/:/g, "")}`;
  const [a, b] = HUES[hue];
  return (
    <svg className="pro-icon" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={`url(#${id})`} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      {PRO_PATHS[name]}
    </svg>
  );
}
