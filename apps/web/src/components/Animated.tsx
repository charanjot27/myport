import { useEffect, useRef, useState } from "react";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up to `value` with an ease-out curve. */
export function AnimatedNumber({ value, duration = 900, format = (n: number) => String(Math.round(n)) }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/** Circular gradient progress ring for scores (0..100). */
export function ScoreRing({ score, size = 120, label = "score" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(c * (1 - Math.max(0, Math.min(100, score)) / 100)));
    return () => cancelAnimationFrame(id);
  }, [score, c]);
  return (
    <div className="score" style={{ width: size, height: size }} role="img" aria-label={`${label} ${score} out of 100`}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c6bff" />
            <stop offset="55%" stopColor="#4f8cff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={9} />
        <circle className="arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={9} strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="num">
        <div>
          <AnimatedNumber value={score} duration={1200} />
          <small>{label.toUpperCase()}</small>
        </div>
      </div>
    </div>
  );
}
