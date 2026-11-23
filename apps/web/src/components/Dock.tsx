import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./dock.css";

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...s}>
    {children}
  </svg>
);

export const DockIcon = {
  home: svg(<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />),
  layers: svg(
    <>
      <path d="m12 4 8.5 4.3L12 12.6 3.5 8.3z" />
      <path d="m3.5 12.2 8.5 4.3 8.5-4.3" />
      <path d="m3.5 16 8.5 4.3 8.5-4.3" />
    </>,
  ),
  pulse: svg(<path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />),
  download: svg(
    <>
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>,
  ),
  help: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6" />
      <path d="M12 17.2h.01" />
    </>,
  ),
  terminal: svg(
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m7.5 10 2.5 2-2.5 2M12.5 15h4" />
    </>,
  ),
  coffee: svg(
    <>
      <path d="M5 9h11v5.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 3.8c-.6.8.6 1.4 0 2.2M12 3.8c-.6.8.6 1.4 0 2.2" />
    </>,
  ),
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
  instagram: svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.8" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M16.9 7.1h.01" />
    </>,
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

/**
 * The site's only navigation: a quiet dock pinned to the bottom. Hover shows a
 * label and gently lifts the icon; the section you're reading stays marked.
 */
export function Dock({ groups }: { groups: DockItem[][] }) {
  const [active, setActive] = useState("#top");

  // Mark the section in view.
  useEffect(() => {
    const ids = groups.flat().filter((i) => i.href.startsWith("#") && i.href !== "#top").map((i) => i.href.slice(1));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const on = () => {
      const mid = innerHeight * 0.45;
      let cur = "#top";
      for (const el of els) if (el.getBoundingClientRect().top < mid) cur = `#${el.id}`;
      setActive(cur);
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
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
      <div className="dock-bar">
        {groups.map((g, gi) => (
          <div className="dock-group" key={gi}>
            {g.map((item) => {
              const inner = (
                <>
                  {item.icon}
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
