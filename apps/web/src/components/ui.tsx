import { useId, type ReactNode } from "react";

/** Page title block shared by the app pages: eyebrow, display title, description and actions. */
export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** iOS-style switch backed by a real checkbox (keyboard, screen readers and getByLabel all work). */
export function Switch({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={`set-row${disabled ? " disabled" : ""}`}>
      <div className="set-text">
        <label htmlFor={id}>{label}</label>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

/** A labelled slider with its live value and a filled track. */
export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="set-row stacked">
      <div className="set-text">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="set-value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="set-hint">{hint}</span>}
    </div>
  );
}

/** A labelled control in a settings row: text on the left, control on the right. */
export function Row({ label, hint, htmlFor, children }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <label htmlFor={htmlFor}>{label}</label>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

const SCORE_R = 15;
/** Small ring showing a 0–100 score. */
export function MiniScore({ score }: { score: number }) {
  const c = 2 * Math.PI * SCORE_R;
  const tone = score >= 80 ? "good" : score >= 60 ? "ok" : "low";
  return (
    <span className={`mini-score ${tone}`} aria-label={`Score ${score}`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={SCORE_R} className="track" />
        <circle cx="18" cy="18" r={SCORE_R} className="bar" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <b>{score}</b>
    </span>
  );
}

/** "2 h ago", "yesterday", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  if (s < 604800) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
