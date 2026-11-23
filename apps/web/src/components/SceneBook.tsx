import { useEffect, useRef, useState, type ReactNode } from "react";
import { ditherSvg, peekDither } from "./dither";
import { SceneCall, SceneDebate, SceneExplain, SceneGroup, SceneInterview, SceneYours } from "./scenes";
import { WaveLoader } from "./WaveLoader";
import "./scene-book.css";

export interface Scene {
  key: string;
  art: () => ReactNode;
  title: string;
  where: string;
  story: string;
  helps: string[];
  /** Optional closing content instead of the "how JOTR helps" list. */
  extra?: ReactNode;
}

export const SCENES: Scene[] = [
  {
    key: "explain",
    art: SceneExplain,
    title: "Explaining a concept",
    where: "Excalidraw · screen recording",
    story: "Your talking points sit under the camera while you sketch, so the explanation flows and you look up at your viewers between drawings.",
    helps: ["Floats over the whiteboard tab", "Follows your voice while you draw", "Hidden from the recording in the desktop app"],
  },
  {
    key: "interview",
    art: SceneInterview,
    title: "A job interview",
    where: "Zoom · Google Meet",
    story: "Keep your key stories and numbers right under the lens. You answer naturally and keep eye contact, with no glancing down at notes.",
    helps: ["Bullet notes, not a word-for-word script", "Waits when you pause to think", "Only you can see it"],
  },
  {
    key: "call",
    art: SceneCall,
    title: "The weekly team call",
    where: "Meet · Teams · Zoom",
    story: "Run the update from your notes while looking at your team, not at a second monitor.",
    helps: ["Floats above every app", "Finds you again when you ad-lib", "No glare in your glasses"],
  },
  {
    key: "debate",
    art: SceneDebate,
    title: "Debate practice",
    where: "Rehearsing out loud",
    story: "Rehearse your opening and rebuttals. JOTR keeps your pace, warns you before tongue-twisters, and scores your delivery after each take.",
    helps: ["Slows down before hard words", "Coach report: pace and fillers", "English, हिन्दी, ਪੰਜਾਬੀ or Hinglish"],
  },
  {
    key: "group",
    art: SceneGroup,
    title: "A group discussion",
    where: "GD rounds · online or on your phone",
    story: "Keep your three points and a strong opening ready, and jump in with confidence when it's your turn.",
    helps: ["Short points in big, calm text", "Jumps to whichever point you start", "Hands-free: open palm to pause"],
  },
];

type Settings = { dither: number; padding: number; crease: number };

/** Renders a scene into a dithered image (shows the wave loader while it prints). */
function Art({ scene, amount }: { scene: Scene; amount: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => peekDither(scene.key, amount));
  // Only a freshly printed image fades in; one already printed shows at once (no blur mid page-turn).
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const hit = peekDither(scene.key, amount);
    if (hit) return setSrc(hit);
    let live = true;
    const t = setTimeout(() => {
      ditherSvg(scene.key, svg, amount)
        .then((u) => {
          if (!live) return;
          setFresh(true);
          setSrc(u);
        })
        .catch(() => live && setSrc(null));
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [scene.key, amount]);
  return (
    <div className="sb-art">
      <div ref={holder} className="sb-svg" aria-hidden>
        {scene.art()}
      </div>
      {src ? <img src={src} alt="" draggable={false} className={fresh ? "fresh" : undefined} /> : <WaveLoader className="sb-loading" label="Printing the scene" />}
    </div>
  );
}

function ImagePage({ scene, s }: { scene: Scene; s: Settings }) {
  return (
    <div className="sb-page sb-left" style={{ ["--pad" as string]: `${s.padding}px` }}>
      <Art scene={scene} amount={s.dither / 100} />
    </div>
  );
}

function TextPage({ scene, index, total }: { scene: Scene; index: number; total: number }) {
  return (
    <div className="sb-page sb-right">
      <div className="sb-text">
        <span className="sb-kicker">
          Scene {String(index + 1).padStart(2, "0")} <i>/ {String(total).padStart(2, "0")}</i>
        </span>
        <h3>{scene.title}</h3>
        <span className="sb-where">{scene.where}</span>
        <p>{scene.story}</p>
        {scene.extra ?? (
          <ul>
            {scene.helps.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </div>
      <span className="sb-folio">JOTR · {String(index + 1).padStart(2, "0")}</span>
    </div>
  );
}

type Flip = { dir: 1 | -1; to: number; go: boolean };

/**
 * A 3D book of scenes: the illustration on the left page, how JOTR helps on the
 * right. Next/Prev turn a real page (on phones the single page flips like a card).
 * Settings tune the dither print, image padding and the depth of the crease.
 */
export function SceneBook({ scenes, closing }: { scenes: Scene[]; closing?: Scene }) {
  const all = closing ? [...scenes, closing] : scenes;
  const n = all.length;
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>({ dither: 70, padding: 14, crease: 60 });
  const narrow = useNarrow();
  const warm = useRef<HTMLDivElement>(null);

  // Print every scene in the background once the book is near the screen, so page turns never wait.
  useEffect(() => {
    const el = warm.current;
    if (!el) return;
    let stop = false;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const svgs = Array.from(el.querySelectorAll<SVGSVGElement>(":scope > div > svg"));
        for (let k = 0; k < svgs.length && !stop; k++) {
          await ditherSvg(all[k]!.key, svgs[k]!, s.dither / 100).catch(() => undefined);
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el.parentElement ?? el);
    return () => {
      stop = true;
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.dither, n]);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const turn = (dir: 1 | -1) => {
    if (flip) return;
    const to = idx + dir;
    if (to < 0 || to >= n) return;
    if (reduce) return setIdx(to);
    setFlip({ dir, to, go: false });
  };
  // Start the turn on the next frame so the leaf animates from its resting angle.
  useEffect(() => {
    if (!flip || flip.go) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setFlip((f) => (f ? { ...f, go: true } : f))));
    return () => cancelAnimationFrame(r);
  }, [flip]);
  const done = () => {
    if (!flip) return;
    setIdx(flip.to);
    setFlip(null);
  };
  // Safety net if transitionend never fires (tab hidden mid-turn).
  useEffect(() => {
    if (!flip?.go) return;
    const t = setTimeout(done, 1400);
    return () => clearTimeout(t);
  });

  const swipe = useRef<number | null>(null);
  const cur = all[idx]!;
  const tgt = flip ? all[flip.to]! : cur;
  const tIdx = flip ? flip.to : idx;

  let body: ReactNode;
  if (narrow) {
    // One page: the whole page flips over like a card, the next scene printed on its back.
    const angle = !flip ? 0 : flip.go ? flip.dir * -180 : 0;
    body = (
      <div className="sb-single">
        <div className={`sb-card${flip?.go ? " turning" : ""}`} style={{ transform: `rotateY(${angle}deg)` }} onTransitionEnd={(e) => e.target === e.currentTarget && done()}>
          <div className="sb-face front">
            <ImagePage scene={cur} s={s} />
            <TextPage scene={cur} index={idx} total={n} />
          </div>
          <div className="sb-face back">
            <ImagePage scene={tgt} s={s} />
            <TextPage scene={tgt} index={tIdx} total={n} />
          </div>
        </div>
      </div>
    );
  } else {
    const left = flip?.dir === -1 ? tgt : cur;
    const leftIdx = flip?.dir === -1 ? tIdx : idx;
    const right = flip?.dir === 1 ? tgt : cur;
    const rightIdx = flip?.dir === 1 ? tIdx : idx;
    void leftIdx;
    const from = flip?.dir === 1 ? 0 : -180;
    const to = flip?.dir === 1 ? -180 : 0;
    body = (
      <div className="sb-spread">
        <ImagePage scene={left} s={s} />
        <TextPage scene={right} index={rightIdx} total={n} />
        {flip && (
          <div className={`sb-leaf${flip.go ? " turning" : ""}`} style={{ transform: `rotateY(${flip.go ? to : from}deg)` }} onTransitionEnd={(e) => e.target === e.currentTarget && done()}>
            <div className="sb-face front">
              {flip.dir === 1 ? <TextPage scene={cur} index={idx} total={n} /> : <TextPage scene={tgt} index={tIdx} total={n} />}
            </div>
            <div className="sb-face back">{flip.dir === 1 ? <ImagePage scene={tgt} s={s} /> : <ImagePage scene={cur} s={s} />}</div>
          </div>
        )}
        <div className="sb-crease" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="sb"
      style={{ ["--crease" as string]: s.crease / 100 }}
      tabIndex={0}
      role="group"
      aria-roledescription="book"
      aria-label={`Scene ${idx + 1} of ${n}: ${cur.title}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") turn(1);
        if (e.key === "ArrowLeft") turn(-1);
      }}
      onPointerDown={(e) => (swipe.current = e.pointerType === "mouse" ? null : e.clientX)}
      onPointerUp={(e) => {
        if (swipe.current === null) return;
        const dx = e.clientX - swipe.current;
        swipe.current = null;
        if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1);
      }}
    >
      <div className="sb-book">{body}</div>
      <div ref={warm} className="sb-warm" aria-hidden>
        {all.map((sc) => (
          <div key={sc.key}>{sc.art()}</div>
        ))}
      </div>
      <div className="sb-controls">
        <button className="sb-btn" onClick={() => turn(-1)} disabled={idx === 0 || !!flip} aria-label="Previous scene">
          <Chevron dir={-1} /> <span>Prev</span>
        </button>
        <span className="sb-caption" aria-live="polite">
          Scene {String(idx + 1).padStart(2, "0")}
        </span>
        <div className="sb-right-controls">
          <button className={`sb-btn icon${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Print settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2.2" />
              <circle cx="10" cy="17" r="2.2" />
            </svg>
          </button>
          <button className="sb-btn" onClick={() => turn(1)} disabled={idx === n - 1 || !!flip} aria-label="Next scene">
            <span>Next</span> <Chevron dir={1} />
          </button>
        </div>
        {open && (
          <div className="sb-panel" role="dialog" aria-label="Print settings">
            <Slider label="Dither" value={s.dither} max={100} onChange={(v) => setS({ ...s, dither: v })} />
            <Slider label="Image padding" value={s.padding} max={32} onChange={(v) => setS({ ...s, padding: v })} />
            <Slider label="Crease depth" value={s.crease} max={100} onChange={(v) => setS({ ...s, crease: v })} />
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="sb-slider">
      <span>
        {label} <b>{value}</b>
      </span>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--v" as string]: `${(value / max) * 100}%` }} />
    </label>
  );
}

function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === 1 ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
    </svg>
  );
}

function useNarrow(q = "(max-width: 760px)") {
  const [m, setM] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export const CLOSING_SCENE: Scene = {
  key: "yours",
  art: SceneYours,
  title: "Your story, next",
  where: "Using JOTR somewhere new?",
  story: "Teaching, pitching, preaching, podcasting: tell me how you use JOTR and your scene could be the next page in this book.",
  helps: [],
};
