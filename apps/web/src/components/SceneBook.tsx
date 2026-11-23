import { useEffect, useRef, useState, type ReactNode } from "react";
import { ditherSvg, peekDither } from "./dither";
import { SceneCall, SceneDebate, SceneExplain, SceneGroup, SceneInterview, SceneYours } from "./scenes";
import { WaveLoader } from "./WaveLoader";
import "./scene-book.css";

export interface Scene {
  key: string;
  /** A real photo of the scene (public/scenes/…); the drawing below stands in until it exists. */
  photo?: string;
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
    photo: "/scenes/explain.jpg",
    art: SceneExplain,
    title: "Recording a tutorial",
    where: "Whiteboard · screen recording",
    story: "Idea → Build → Ship on the whiteboard, the outline in the notch. He sketches, glances up at the lens, and the next point is already there.",
    helps: ["Notch reads “Explain the idea. Build. Test. Ship.”", "Sits under the camera, over the whiteboard", "Hidden from the screen recording"],
  },
  {
    key: "call",
    photo: "/scenes/call.jpg",
    art: SceneCall,
    title: "The launch call",
    where: "Team video call · 6 people",
    story: "Eighteen minutes into the weekly call, the plan is still right under her camera. She talks to the team, not to a second screen.",
    helps: ["Notch reads “Launch: Friday. Next: QA and handoff.”", "Floats above the meeting app", "Waits while others are talking"],
  },
  {
    key: "group",
    photo: "/scenes/group.jpg",
    art: SceneGroup,
    title: "An online group discussion",
    where: "GD round · “Remote work: yes or no?”",
    story: "Four faces on the call, three points in the notch. She makes her case on flexibility first, then cost, culture and trust, without looking down.",
    helps: ["Notch reads “Flexibility first. Cost. Culture. Trust.”", "Short points, big calm text", "Jumps to whichever point she starts"],
  },
  {
    key: "debate",
    photo: "/scenes/debate.jpg",
    art: SceneDebate,
    title: "Debate practice",
    where: "Lectern · motion: remote work",
    story: "At the lectern, the opponent waiting her turn. The notch keeps his line of attack in view while he holds the room’s eye.",
    helps: ["Notch reads “Lead with evidence. Rebut the cost claim.”", "Slows down before hard words", "English, हिन्दी, ਪੰਜਾਬੀ or Hinglish"],
  },
  {
    key: "record",
    photo: "/scenes/record.jpg",
    art: SceneInterview,
    title: "Rehearse, record, review",
    where: "Recording a practice take",
    story: "JOTR records the take, tracks where he is (Opening, Evidence, Rebuttal) and scores pace and fillers after. One minute twenty-four in, still on track.",
    helps: ["Records with the camera behind the text", "Shows which part you’re in", "A coach report after every take"],
  },
];

type Settings = { dither: number; padding: number; crease: number };

/** Renders a scene into a dithered image (shows the wave loader while it prints). */
const photos = new Map<string, Promise<HTMLImageElement | null>>();
/** Loads a scene photo once; null when the file isn't there (the drawing is used instead). */
function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  let p = photos.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    photos.set(url, p);
  }
  return p;
}

/** The picture for a scene: its photo when there is one, else the drawing. */
async function printScene(scene: Scene, svg: SVGSVGElement, amount: number): Promise<string> {
  const photo = scene.photo ? await loadPhoto(scene.photo) : null;
  return photo ? ditherSvg(`${scene.key}-photo`, photo, amount) : ditherSvg(scene.key, svg, amount);
}

function Art({ scene, amount }: { scene: Scene; amount: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const peek = () => peekDither(`${scene.key}-photo`, amount) ?? peekDither(scene.key, amount);
  const [src, setSrc] = useState<string | null>(peek);
  // Only a freshly printed image fades in; one already printed shows at once (no blur mid page-turn).
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const hit = peek();
    if (hit) return setSrc(hit);
    let live = true;
    const t = setTimeout(() => {
      printScene(scene, svg, amount)
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
  const [s, setS] = useState<Settings>({ dither: 0, padding: 14, crease: 60 });
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
          await printScene(all[k]!, svgs[k]!, s.dither / 100).catch(() => undefined);
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
