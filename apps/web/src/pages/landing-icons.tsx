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
