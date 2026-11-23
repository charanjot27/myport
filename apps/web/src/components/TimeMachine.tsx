import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./time-machine.css";

export interface TimeCard {
  /** Short name on the timeline rail. */
  label: string;
  title: string;
  tone: string;
  body: ReactNode;
}

/**
 * Time Machine stack: cards recede into depth like Time Machine's windows; the
 * front one flies toward you when you move on. A timeline rail on the side jumps
 * straight to any card. Wheel (while the pointer is over the stack), arrow keys,
 * a horizontal swipe, or a tap on a card behind all move through it; it plays on
 * its own while in view until you take over.
 */
export function TimeMachine({ cards, interval = 4200 }: { cards: TimeCard[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const n = cards.length;

  const go = useCallback((k: number, byUser = true) => {
    setActive(Math.max(0, Math.min(n - 1, k)));
    if (byUser) setAuto(false);
  }, [n]);

  // Plays on its own while on screen (not for reduced motion), looping back to the start.
  useEffect(() => {
    const el = root.current;
    if (!el || !auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let visible = false;
    const tick = () => {
      if (visible && !el.matches(":hover")) setActive((a) => (a + 1) % n);
    };
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    timer = window.setInterval(tick, interval);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [auto, n, interval]);

  // Wheel over the stack steps through time; at either end the page scrolls on as usual.
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(".tm-stage");
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const a = activeRef.current;
      const next = a + Math.sign(d);
      if (!d || next < 0 || next >= n) return; // at either end: let the page scroll
      e.preventDefault();
      acc += d;
      const now = performance.now();
      if (Math.abs(acc) < 40 || now - last.current < 420) return;
      acc = 0;
      last.current = now;
      go(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [n, go]);

  // Horizontal swipe on touch screens (vertical stays page scroll).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(active + (dx < 0 ? 1 : -1));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      go(active + step);
    } else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
  };

  return (
    <div className="tm" ref={root} role="region" aria-roledescription="carousel" aria-label="JOTR in action">
      <div
        className="tm-stage"
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        aria-live="polite"
      >
        {cards.map((c, k) => {
          const o = k - active;
          return (
            <div
              key={c.label}
              className="tm-card"
              data-state={o < 0 ? "past" : o === 0 ? "now" : "next"}
              data-far={o > 4 || undefined}
              style={{ ["--o" as string]: Math.max(0, o) }}
              aria-hidden={o !== 0}
              onClick={o > 0 ? () => go(k) : undefined}
            >
              <article className={`lg-shot tone-${c.tone}`}>
                <h3>{c.title}</h3>
                <div className="lg-shot-stage">{c.body}</div>
              </article>
            </div>
          );
        })}
      </div>
      <div className="tm-rail" role="tablist" aria-label="Timeline">
        {cards.map((c, k) => (
          <button
            key={c.label}
            role="tab"
            aria-selected={k === active}
            aria-label={c.title}
            className={`tm-tick${k === active ? " on" : ""}`}
            onClick={() => go(k)}
          >
            <span className="tm-label">{c.label}</span>
            <i />
          </button>
        ))}
        <span className="tm-progress" aria-hidden style={{ ["--p" as string]: n > 1 ? active / (n - 1) : 0 }} />
      </div>
    </div>
  );
}
