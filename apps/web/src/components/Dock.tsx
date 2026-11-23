import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BookOpen,
  CircleHelp,
  Clapperboard,
  Coffee,
  Download,
  House,
  Instagram,
  Laptop,
  Layers,
  SquareTerminal,
} from "lucide-react";
import "./dock.css";

const lucide = { size: 22, strokeWidth: 1.6, absoluteStrokeWidth: true, "aria-hidden": true } as const;

export const DockIcon = {
  home: <House {...lucide} />,
  look: <Laptop {...lucide} />,
  action: <Clapperboard {...lucide} />,
  layers: <Layers {...lucide} />,
  book: <BookOpen {...lucide} />,
  pulse: <Activity {...lucide} />,
  download: <Download {...lucide} />,
  help: <CircleHelp {...lucide} />,
  terminal: <SquareTerminal {...lucide} />,
  coffee: <Coffee {...lucide} />,
  instagram: <Instagram {...lucide} />,
  // Official marks, filled, as brands draw them.
  github: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.47.09.65-.2.65-.46v-1.6c-2.64.58-3.2-1.27-3.2-1.27-.43-1.1-1.06-1.39-1.06-1.39-.86-.59.07-.58.07-.58.95.07 1.45.98 1.45.98.85 1.45 2.22 1.03 2.77.79.08-.62.33-1.03.6-1.27-2.1-.24-4.32-1.06-4.32-4.7 0-1.04.37-1.89.98-2.55-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.62.97a9.1 9.1 0 0 1 4.77 0c1.82-1.23 2.62-.97 2.62-.97.52 1.31.19 2.28.09 2.52.61.66.98 1.51.98 2.55 0 3.65-2.22 4.46-4.34 4.69.34.29.65.87.65 1.76v2.6c0 .26.17.56.66.46A9.5 9.5 0 0 0 12 2.5z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden fill="currentColor">
      <path d="M5.3 8.6h3v10.6h-3zM6.8 3.8a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10.3 8.6h2.9V10h.04c.4-.76 1.38-1.56 2.85-1.56 3.05 0 3.6 2 3.6 4.6v6.16h-3v-5.46c0-1.3-.02-2.98-1.82-2.98-1.82 0-2.1 1.42-2.1 2.88v5.56h-3z" />
    </svg>
  ),
};

export interface DockItem {
  label: string;
  icon: ReactNode;
  /** "#id" scrolls to a section; "/path" is an app route; anything else opens in a new tab. */
  href: string;
  /** Leave out on the narrowest phones, where the dock can't fit everything. */
  optional?: boolean;
}

/** Magnification: how much the icon under the pointer grows, and how far the swell reaches. */
const MAX_SCALE = 1.75;
const REACH = 150;

/**
 * The site's only navigation: a dock pinned to the bottom. With a mouse it
 * magnifies like the macOS dock (icons swell by distance from the pointer and
 * push their neighbours apart); the section on screen stays marked.
 */
export function Dock({ groups }: { groups: DockItem[][] }) {
  const [active, setActive] = useState("#top");
  const bar = useRef<HTMLDivElement>(null);

  // Mark the section in view.
  useEffect(() => {
    const ids = groups.flat().filter((i) => i.href.startsWith("#") && i.href !== "#top").map((i) => i.href.slice(1));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const on = () => {
      const mid = innerHeight * 0.5;
      let cur = "#top";
      for (const el of els) if (el.getBoundingClientRect().top <= mid) cur = `#${el.id}`;
      setActive(cur);
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [groups]);

  // macOS-style magnification, spring-smoothed, written straight to CSS variables (no re-renders).
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const items = Array.from(el.querySelectorAll<HTMLElement>(".dock-item"));
    const scale = items.map(() => 1);
    let mouseX: number | null = null;
    let raf = 0;
    const frame = () => {
      raf = 0;
      let moving = false;
      items.forEach((it, k) => {
        let target = 1;
        if (mouseX !== null) {
          const r = it.getBoundingClientRect();
          const d = Math.abs(mouseX - (r.left + r.width / 2));
          if (d < REACH) target = 1 + (MAX_SCALE - 1) * ((Math.cos((Math.PI * d) / REACH) + 1) / 2);
        }
        const next = scale[k]! + (target - scale[k]!) * 0.28;
        scale[k] = Math.abs(target - next) < 0.002 ? target : next;
        if (scale[k] !== target) moving = true;
        it.style.setProperty("--s", scale[k]!.toFixed(4));
      });
      if (moving) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => {
      if (!fine.matches || still.matches || e.pointerType !== "mouse") return;
      mouseX = e.clientX;
      kick();
    };
    const leave = () => {
      mouseX = null;
      kick();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [groups]);

  const go = (href: string) => (e: React.MouseEvent) => {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    if (href === "#top") scrollTo({ top: 0, behavior: "smooth" });
    else document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", href === "#top" ? location.pathname : href);
  };

  return (
    <nav className="dock" aria-label="Site">
      <div className="dock-bar" ref={bar}>
        {groups.map((g, gi) => (
          <div className="dock-group" key={gi}>
            {g.map((item) => {
              const inner = (
                <>
                  <span className="dock-ic">{item.icon}</span>
                  <span className="dock-tip">{item.label}</span>
                </>
              );
              const cls = `dock-item${active === item.href ? " on" : ""}${item.optional ? " optional" : ""}`;
              if (item.href.startsWith("/"))
                return (
                  <Link key={item.label} to={item.href} className={cls} aria-label={item.label}>
                    {inner}
                  </Link>
                );
              const external = !item.href.startsWith("#");
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={cls}
                  aria-label={item.label}
                  aria-current={active === item.href ? "location" : undefined}
                  onClick={go(item.href)}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        ))}
      </div>
      <span className="dock-handle" aria-hidden />
    </nav>
  );
}
