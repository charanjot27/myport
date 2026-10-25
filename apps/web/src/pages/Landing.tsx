import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, ProIcon, Silhouette, type Hue, type ProIconName } from "./landing-icons";
import type { Laptop3D, ScreenMode } from "./laptop3d";
import type { StarField } from "./starfield";
import "./landing.css";

/**
 * JOTR public landing page. No stock photos or fabricated social proof:
 * every visual is a live, drawn rendering of what the product does.
 */

const HERO_SCRIPT =
  "Hi, I'm Charanjot. This text sits right under my camera, so you see me looking at you, not at my notes. When I pause, JOTR waits. When I skip ahead, it follows. And it warns me before I trip over words like psycholinguistics.";

/** Real quotes only: add { quote, name, role } entries once you have them and the section appears. */
const TESTIMONIALS: Array<{ quote: string; name: string; role: string }> = [];

const FAQ: Array<{ q: string; a: ReactNode }> = [
  { q: "Who is JOTR for?", a: "Anyone who talks to a camera from notes: creators recording videos, teachers and coaches teaching online, founders pitching, and anyone practising presentations or interviews." },
  { q: "Does it work with Google Meet, Zoom and other apps?", a: "Yes. Press “Start floating” and JOTR opens a small always-on-top window that stays above every tab and app. Drag it under your camera once and Chrome remembers the spot." },
  { q: "Will people see it if I share my screen?", a: "Not if you share a single tab or window. If you share your entire screen, the floating window is part of it, so it will be visible." },
  { q: "I wear glasses. Will the text reflect in them?", a: "JOTR is designed against it: dim warm text, a small window, no bright backgrounds, and a reflection check that measures your glasses through the camera and dims the text until the reflection disappears. It keeps checking while you talk." },
  { q: "Which languages can I speak?", a: "English, Hindi, Punjabi and Hinglish, and you can mix them in one script. Write in Devanagari, Gurmukhi or English letters: JOTR matches what you say to what you wrote even when the recogniser spells it in another script, so “meeting” in your script follows “मीटिंग” or “ਮੀਟਿੰਗ”. Spanish, French, German, Portuguese and Japanese work too." },
  { q: "What if I lose my place?", a: "Just keep talking. JOTR listens and finds you again, even if you skip a paragraph, repeat a sentence or ad-lib. You can also press Space or raise an open palm to pause." },
  { q: "Does my video leave my computer?", a: "No. Face and eye tracking run in your browser. Speech goes only to the recogniser you choose, and recordings are saved only when you download them." },
  { q: "Which browsers and devices?", a: "Chrome and Edge on Mac, Windows and ChromeOS give the full experience, including the floating window. iPhone and Android apps are on the way." },
  { q: "How much does it cost?", a: "The web app is free while JOTR is in early access." },
];

/* ----------------------------------------------------------------- motion */

/** Reveal elements marked data-reveal as they scroll into view. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>("[data-reveal]") ?? [];
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [root]);
}

/** 3D tilt that follows the pointer (mouse or finger), eased with requestAnimationFrame. */
function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const loop = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((x + 1) * 50).toFixed(1)}%`);
      el.style.setProperty("--my", `${((y + 1) * 50).toFixed(1)}%`);
      if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      kick();
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointercancel", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointercancel", leave);
    };
  }, [max]);
  return ref;
}

/* ------------------------------------------------------------------- page */

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  useReveal(root);
  useEffect(() => {
    document.documentElement.classList.add("landing-root");
    return () => document.documentElement.classList.remove("landing-root");
  }, []);

  return (
    <div className="landing" ref={root}>
      <Nav />
      <Hero onWatch={() => setDemoOpen(true)} />
      <Statement />
      <CloserLook />
      <Screens />
      <Features />
      <HowItWorks />
      <UseCases />
      {TESTIMONIALS.length > 0 && <Testimonials />}
      <Faq />
      <FinalCta onWatch={() => setDemoOpen(true)} />
      <Footer />
      <DemoPopup open={demoOpen} setOpen={setDemoOpen} />
    </div>
  );
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="lg-logo">
      <img src="/favicon.svg" width={size} height={size} alt="" />
      <span>JOTR</span>
    </span>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = (
    <>
      <a href="#features" onClick={() => setMenu(false)}>
        Features
      </a>
      <a href="#how" onClick={() => setMenu(false)}>
        How it works
      </a>
      <a href="#faq" onClick={() => setMenu(false)}>
        FAQ
      </a>
    </>
  );
  return (
    <header className={`lg-nav${scrolled ? " scrolled" : ""}${menu ? " open" : ""}`}>
      <Link to="/" aria-label="JOTR home" className="lg-home">
        <Logo />
      </Link>
      <nav className="lg-links">{links}</nav>
      <Link to="/app" className="lg-btn lg-btn-white sm">
        Open JOTR
      </Link>
      <button className="lg-burger" onClick={() => setMenu((m) => !m)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu}>
        {menu ? Icon.close : Icon.menu}
      </button>
      <div className="lg-sheet" aria-hidden={!menu}>
        {links}
        <Link to="/app" className="lg-btn lg-btn-ember">
          Start free {Icon.arrow}
        </Link>
      </div>
    </header>
  );
}

/** The black notch hanging from the camera, with words lighting up as if spoken. */
function NotchDemo({ script = HERO_SCRIPT, speed = 320, lines = 3, className = "" }: { script?: string; speed?: number; lines?: number; className?: string }) {
  const words = script.split(" ");
  const [i, setI] = useState(0);
  const curRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % (words.length + 8)), speed);
    return () => window.clearInterval(id);
  }, [words.length, speed]);

  useEffect(() => {
    const el = curRef.current;
    setOffset(el ? el.offsetTop : 0);
  }, [i]);

  const hard = words.findIndex((w) => w.startsWith("psycholinguistics"));
  return (
    <div className={`lg-notch ${className}`} style={{ ["--lines" as string]: lines }}>
      <span className="lg-cam" aria-hidden />
      <div className="lg-notch-text" aria-label={script}>
        <div style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
          {words.map((w, k) => (
            <span
              key={k}
              ref={k === Math.min(i, words.length - 1) ? curRef : undefined}
              className={k < i ? "said" : k === i ? "now" : k === hard && i >= hard - 7 ? "hard" : ""}
            >
              {w}{" "}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ onWatch }: { onWatch: () => void }) {
  return (
    <section className="lg-hero">
      <div className="lg-bloom" aria-hidden />
      <div className="lg-rays" aria-hidden />
      <NotchDemo className="hero" lines={2} />
      <div className="lg-hero-copy">
        <span className="lg-badge" data-reveal>
          <span className="pulse" /> Early access · free in Chrome
        </span>
        <h1 data-reveal style={{ ["--d" as string]: "80ms" }}>
          Read your script.
          <br />
          <span className="lg-ember-text">Look them in the eye.</span>
        </h1>
        <p data-reveal style={{ ["--d" as string]: "160ms" }}>
          Your words, right under your camera. JOTR follows your voice, warns you before you stumble, and keeps the text out of your glasses’ reflection.
        </p>
        <div className="lg-ctas" data-reveal style={{ ["--d" as string]: "240ms" }}>
          <Link to="/app" className="lg-btn lg-btn-white lg">
            <img src="/favicon.svg" width={22} height={22} alt="" /> Start free in your browser
          </Link>
          <button className="lg-btn lg-btn-glass lg" onClick={onWatch}>
            <span className="lg-play">{Icon.play}</span> Watch the demo
          </button>
        </div>
        <ul className="lg-ticks" data-reveal style={{ ["--d" as string]: "320ms" }}>
          <li>{Icon.check} Nothing to install</li>
          <li>{Icon.check} Works over Meet, Zoom &amp; any tab</li>
          <li>{Icon.check} Video never leaves your device</li>
        </ul>
      </div>
    </section>
  );
}

/** A turning cloud of stars that bends toward the cursor (or finger) like a magnet. */
function Statement() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const sec = section.current;
    if (!el || !sec) return;
    const ac = new AbortController();
    let field: StarField | null = null;
    void import("./starfield").then(({ StarField }) => {
      if (ac.signal.aborted) return;
      const f = new StarField(el, { count: innerWidth < 700 ? 2200 : 4600 });
      field = f;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const io = new IntersectionObserver(([e]) => (e?.isIntersecting && !reduced ? f.start() : f.stop()));
      io.observe(el);
      const ro = new ResizeObserver(() => f.resize());
      ro.observe(el);
      const at = (x: number, y: number) => {
        const r = el.getBoundingClientRect();
        f.setPointer(x - r.left, y - r.top);
      };
      const o = { signal: ac.signal, passive: true };
      sec.addEventListener("pointermove", (e) => at(e.clientX, e.clientY), o);
      sec.addEventListener("pointerleave", () => f.setPointer(null), o);
      // Touch: follow the finger while the page scrolls.
      sec.addEventListener("touchmove", (e) => e.touches[0] && at(e.touches[0].clientX, e.touches[0].clientY), o);
      sec.addEventListener("touchend", () => f.setPointer(null), o);
      ac.signal.addEventListener("abort", () => {
        io.disconnect();
        ro.disconnect();
      });
    });
    return () => {
      ac.abort();
      field?.stop();
    };
  }, []);

  return (
    <section className="lg-statement" ref={section} aria-labelledby="why-jotr">
      <canvas ref={canvas} className="lg-stars" aria-hidden />
      <span className="lg-corner tl" aria-hidden />
      <span className="lg-corner tr" aria-hidden />
      <span className="lg-corner bl" aria-hidden />
      <span className="lg-corner br" aria-hidden />
      <div className="lg-statement-copy">
        <h2 id="why-jotr" data-reveal>
          Why JOTR
        </h2>
        <span className="lg-rule" data-reveal aria-hidden />
        <p data-reveal style={{ ["--d" as string]: "80ms" }}>
          Teleprompters make you look away.
          <br />
          <strong className="lg-ember-text">JOTR puts your words under the lens, in the language you speak.</strong>
          <br />
          Your audience only sees you.
        </p>
      </div>
    </section>
  );
}

/** CSS laptop, shown where WebGL is unavailable. */
function CssLaptop() {
  return (
    <div className="lg-laptop">
      <div className="lg-lid">
        <div className="lg-display">
          <div className="lg-call">
            {["You", "Priya", "Marco", "Aiko"].map((n, k) => (
              <div key={n} className={`lg-tile${k === 0 ? " me" : ""}`}>
                <Silhouette />
                <span className="lg-name">{n}</span>
              </div>
            ))}
          </div>
          <NotchDemo className="in-laptop" lines={2} speed={360} script="Thanks for joining, everyone. Today I'll walk you through our launch plan, the three numbers that matter, and what we need from each team this week." />
        </div>
      </div>
      <div className="lg-base" />
    </div>
  );
}

const LOOKS: Array<{ id: ScreenMode; label: string; text: string }> = [
  { id: "voice", label: "Follows your voice", text: "The line you're on stays lit and scrolls as you speak. Pause, skip a paragraph or ad-lib, and it finds you again." },
  { id: "notch", label: "Under the camera", text: "Your script hangs right below the lens, no wider than the notch, so your eyes stay where your audience is looking." },
  { id: "glare", label: "No glare", text: "JOTR reads your room and your glasses through the camera and dims the text until no reflection shows." },
  { id: "float", label: "Over any call", text: "An always-on-top window that sits over Meet, Zoom, Teams or any tab. Only you can see it." },
  { id: "coach", label: "Coach report", text: "After every take: your pace, filler words, eye contact and the stumbles JOTR caught early." },
];

/** Apple-style "closer look": a 3D laptop whose lid opens as you scroll, with pills that change the view. */
function CloserLook() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Laptop3D | null>(null);
  const [mode, setMode] = useState<ScreenMode>("voice");
  const modeRef = useRef(mode);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    import("./laptop3d")
      .then(({ Laptop3D, webglAvailable }) => {
        const el = canvas.current;
        if (ac.signal.aborted || !el) return;
        if (!webglAvailable()) return setFallback(true);
        let e: Laptop3D;
        try {
          e = new Laptop3D(el);
        } catch {
          return setFallback(true);
        }
        engine.current = e;
        e.setMode(modeRef.current);
        const onScroll = () => {
          const r = section.current?.getBoundingClientRect();
          if (r) e.setProgress((innerHeight - r.top) / (innerHeight * 0.95));
        };
        onScroll();
        addEventListener("scroll", onScroll, { passive: true, signal: ac.signal });
        const io = new IntersectionObserver(([en]) => (en?.isIntersecting ? e.start() : e.stop()));
        io.observe(el);
        const ro = new ResizeObserver(() => e.resize());
        ro.observe(el);
        el.dataset.ready = "1";
        ac.signal.addEventListener("abort", () => {
          io.disconnect();
          ro.disconnect();
          e.dispose();
          engine.current = null;
        });
      })
      .catch(() => setFallback(true));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    engine.current?.setMode(mode);
  }, [mode]);

  const onPointer = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    engine.current?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * -2 + 1);
  };
  const active = LOOKS.find((l) => l.id === mode)!;

  return (
    <section className="lg-look" ref={section} id="look" aria-label="Take a closer look">
      <h2 className="lg-apple-h" data-reveal>
        Take a closer look.
      </h2>
      <div className="lg-look-panel" data-reveal>
        <div className="lg-look-stage" onPointerMove={onPointer} onPointerLeave={() => engine.current?.setPointer(0, 0)}>
          {fallback ? <CssLaptop /> : <canvas ref={canvas} className="lg-look-canvas" role="img" aria-label="A laptop running JOTR, with the script right under the camera" />}
        </div>
        <div className="lg-look-pills" role="tablist" aria-label="Closer look">
          {LOOKS.map((l) => {
            const on = l.id === mode;
            return (
              <button key={l.id} role="tab" aria-selected={on} className={`lg-pill${on ? " on" : ""}`} onClick={() => setMode(l.id)}>
                <span className="lg-pill-icon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10.5" />
                    <path d={on ? "M7.5 12h9" : "M7.5 12h9M12 7.5v9"} />
                  </svg>
                </span>
                <span className="lg-pill-text">
                  <b>{l.label}</b>
                  <span className="lg-pill-more">
                    <span>{l.text}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="lg-look-desc" aria-live="polite">
          <b>{active.label}.</b> {active.text}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- screenshots */

function Screens() {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const count = 5;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (card) setPage(Math.round(el.scrollLeft / (card.offsetWidth + 20)));
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  const go = (n: number) => {
    const el = ref.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (el && card) el.scrollTo({ left: Math.max(0, Math.min(count - 1, n)) * (card.offsetWidth + 20), behavior: "smooth" });
  };
  return (
    <section className="lg-section">
      <div className="lg-head" data-reveal>
        <span className="lg-eyebrow">See it in action</span>
        <h2>Made for talking to a camera</h2>
      </div>
      <div className="lg-shots-wrap">
        <div className="lg-shots" ref={ref}>
          <Shot tone="rose" title="Keep eye contact with your audience" d={0}>
            <div className="sh-phone">
              <div className="sh-island" />
              <NotchDemo className="in-phone" lines={4} speed={420} script="Your words sit right under the lens, so every viewer feels you're talking to them, and only them." />
              <Silhouette className="sh-sil" />
            </div>
          </Shot>
          <Shot tone="amber" title="Floats over Meet, Zoom & any tab" d={80}>
            <div className="sh-mac">
              <div className="sh-mac-screen">
                <div className="sh-grid">
                  {Array.from({ length: 6 }, (_, k) => (
                    <span key={k}>
                      <Silhouette />
                    </span>
                  ))}
                </div>
                <div className="sh-float">Thanks for joining. Today I'll walk you through the plan…</div>
              </div>
            </div>
          </Shot>
          <Shot tone="violet" title="Warns you before you stumble" d={160}>
            <div className="sh-phone">
              <div className="sh-island" />
              <div className="sh-text">
                <span className="said">It slows down and lights up </span>
                <span className="sh-hard">psycholinguistics</span>
                <span> a second before you reach it.</span>
              </div>
              <div className="sh-risk">
                <span />
              </div>
            </div>
          </Shot>
          <Shot tone="ink" title="No glare in your glasses" d={240}>
            <div className="sh-lenses">
              <figure>
                <div className="lens bad">
                  <i />
                </div>
                <figcaption>Bright prompter</figcaption>
              </figure>
              <figure>
                <div className="lens good" />
                <figcaption className="ok">JOTR</figcaption>
              </figure>
              <div className="sh-auto">
                <span>Auto brightness</span>
                <div className="bar">
                  <i />
                </div>
              </div>
            </div>
          </Shot>
          <Shot tone="mint" title="A coach after every take" d={320}>
            <div className="sh-report">
              <div className="ring">
                <b>86</b>
                <small>score</small>
              </div>
              <ul>
                <li>
                  <span>Pace</span>
                  <b>148 wpm</b>
                </li>
                <li>
                  <span>Fillers</span>
                  <b>2</b>
                </li>
                <li>
                  <span>Eye contact</span>
                  <b>94%</b>
                </li>
                <li>
                  <span>Stumbles caught early</span>
                  <b>3 of 4</b>
                </li>
              </ul>
            </div>
          </Shot>
        </div>
        <div className="lg-dots" role="tablist" aria-label="Screenshots">
          {Array.from({ length: count }, (_, k) => (
            <button key={k} role="tab" aria-selected={page === k} aria-label={`Screenshot ${k + 1}`} className={page === k ? "on" : ""} onClick={() => go(k)} />
          ))}
        </div>
      </div>
      <div className="lg-stores" data-reveal>
        <span className="lg-store">
          {Icon.apple}
          <span>
            <small>Coming soon to</small>App Store
          </span>
        </span>
        <span className="lg-store">
          {Icon.android}
          <span>
            <small>Coming soon to</small>Google Play
          </span>
        </span>
      </div>
    </section>
  );
}

function Shot({ title, tone, children, d }: { title: string; tone: string; children: ReactNode; d: number }) {
  const ref = useTilt<HTMLElement>(6);
  return (
    // The wrapper reveals on scroll; the card inside tilts (separate transforms, so neither lags the other).
    <div className="lg-shot-cell" data-reveal style={{ ["--d" as string]: `${d}ms` }}>
      <article ref={ref} className={`lg-shot tone-${tone}`}>
        <div className="lg-shot-shine" aria-hidden />
        <h3>{title}</h3>
        <div className="lg-shot-stage">{children}</div>
      </article>
    </div>
  );
}

/* --------------------------------------------------------------- features */

const CARDS: Array<{ icon: ProIconName; hue: Hue; lead: string; rest: string; size?: "tall" | "wide"; visual?: ReactNode }> = [
  {
    icon: "sparkles",
    hue: "violet",
    lead: "Predicts a stumble",
    rest: " a second before it happens, and slows down while you get there.",
    size: "tall",
    visual: (
      <div className="fv-stumble" aria-hidden>
        <span className="said">and our research builds on </span>
        <span className="hard">psycholinguistics</span>
        <div className="risk">
          <i />
        </div>
      </div>
    ),
  },
  { icon: "glasses", hue: "sun", lead: "No glare", rest: " in your glasses. Brightness follows your room." },
  {
    icon: "voice",
    hue: "rose",
    lead: "Scrolls with your voice.",
    rest: " Pause, skip or ad-lib and it finds you again.",
    size: "tall",
    visual: (
      <div className="fv-voice" aria-hidden>
        <div className="wave">
          {Array.from({ length: 30 }, (_, k) => (
            <i key={k} style={{ animationDelay: `${(k * 73) % 900}ms` }} />
          ))}
        </div>
        <p>
          <span className="said">Today I'll show you </span>
          <span className="now">how</span> it follows me.
        </p>
      </div>
    ),
  },
  { icon: "pip", hue: "sky", lead: "Floats over", rest: " Meet, Zoom, Teams and any tab." },
  { icon: "eye", hue: "mint", lead: "Eye contact", rest: " that stays natural. Corrected only while you read." },
  { icon: "shield", hue: "sky", lead: "Verified live,", rest: " not a recording or a deepfake." },
  { icon: "gauge", hue: "sun", lead: "A coach report", rest: " after every take: pace, fillers and eye contact." },
  { icon: "hand", hue: "violet", lead: "Hands-free.", rest: " Open palm to pause, peace sign to skip ahead." },
  { icon: "globe", hue: "rose", lead: "Speaks your language.", rest: " English, हिन्दी, ਪੰਜਾਬੀ or Hinglish, even mixed in one sentence.", size: "wide" },
  { icon: "lock", hue: "mint", lead: "Private by design.", rest: " Video is processed on your device. Nothing uploaded, nothing stored.", size: "wide" },
];

function Features() {
  return (
    <section className="lg-section lg-cards-section" id="features">
      <h2 className="lg-apple-h" data-reveal>
        <span className="dim">Here’s what you get with</span> JOTR.
      </h2>
      <div className="lg-cards">
        {CARDS.map((c, k) => (
          <FeatureCard key={c.icon} {...c} d={(k % 2) * 80} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ icon, hue, lead, rest, size, visual, d }: (typeof CARDS)[number] & { d: number }) {
  const ref = useTilt<HTMLElement>(2.5);
  return (
    <div className={`lg-card-cell${size ? ` ${size}` : ""}`} data-reveal style={{ ["--d" as string]: `${d}ms` }}>
      <article ref={ref} className={`lg-card hue-${hue}`}>
        {visual && <div className="lg-card-visual">{visual}</div>}
        <div className="lg-card-body">
          <ProIcon name={icon} hue={hue} size={size === "tall" ? 64 : 58} />
          <h3>
            <span className="lead">{lead}</span>
            <span className="rest">{rest}</span>
          </h3>
        </div>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------ how it works */

function HowItWorks() {
  const steps = [
    { title: "Paste your script", text: "Or import a .txt / .md file. Mark sections with # and cues like [pause]." },
    { title: "One-minute setup", text: "Show JOTR where your camera is. It checks your glasses for glare and learns your eyes." },
    { title: "Just talk", text: "Your words stay under the lens and follow your voice. Your coach report is waiting at the end." },
  ];
  return (
    <section className="lg-section" id="how">
      <div className="lg-head" data-reveal>
        <span className="lg-eyebrow">How it works</span>
        <h2>Ready in a minute</h2>
      </div>
      <ol className="lg-steps">
        {steps.map((s, k) => (
          <li key={s.title} data-reveal style={{ ["--d" as string]: `${k * 120}ms` }}>
            <span className="n">{k + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function UseCases() {
  const uses = ["YouTube & course videos", "Online classes", "Investor pitches", "Sales demos", "Webinars", "Interview practice", "Presentations", "Podcasts"];
  return (
    <section className="lg-uses" aria-label="Who uses JOTR">
      <div className="lg-marquee">
        <div>
          {[...uses, ...uses].map((u, k) => (
            <span key={k}>{u}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="lg-section">
      <div className="lg-head" data-reveal>
        <span className="lg-eyebrow">Loved by early users</span>
        <h2>What people say</h2>
      </div>
      <div className="lg-quotes">
        {TESTIMONIALS.map((t, k) => (
          <figure key={t.name} className="lg-quote" data-reveal style={{ ["--d" as string]: `${k * 80}ms` }}>
            <blockquote>“{t.quote}”</blockquote>
            <figcaption>
              <b>{t.name}</b>
              <span>{t.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lg-paper" id="faq">
      <div className="lg-section narrow">
        <div className="lg-head" data-reveal>
          <span className="lg-eyebrow dark">FAQ</span>
          <h2>Questions, answered</h2>
        </div>
        <div className="lg-faq" data-reveal>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span className="chev" aria-hidden />
              </summary>
              <div className="ans">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onWatch }: { onWatch: () => void }) {
  return (
    <section className="lg-final">
      <div className="lg-final-glow" aria-hidden />
      <h2 data-reveal>
        Say exactly what you mean.
        <br />
        <span>And look like you mean it.</span>
      </h2>
      <div className="lg-ctas" data-reveal style={{ ["--d" as string]: "120ms" }}>
        <Link to="/app" className="lg-btn lg-btn-white lg">
          Start free {Icon.arrow}
        </Link>
        <button className="lg-btn lg-btn-glass lg" onClick={onWatch}>
          <span className="lg-play">{Icon.play}</span> Watch the demo
        </button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lg-footer">
      <Logo size={24} />
      <span>© {new Date().getFullYear()} JOTR. Made for people who talk to cameras.</span>
      <nav>
        <Link to="/privacy">Privacy</Link>
        <Link to="/app">Open app</Link>
      </nav>
    </footer>
  );
}

/* ------------------------------------------------------------------ demo */

const DEMO_STEPS = [
  { caption: "Paste your script", scene: "script" },
  { caption: "JOTR sits right under your camera", scene: "notch" },
  { caption: "It follows your voice, word by word", scene: "follow" },
  { caption: "A hard word is coming: it slows down and warns you", scene: "hard" },
  { caption: "Floats over your meeting, invisible to others", scene: "float" },
] as const;

function DemoScene({ step }: { step: number }) {
  const scene = DEMO_STEPS[step]!.scene;
  return (
    <div className={`d-scene s-${scene}`}>
      <div className="d-laptop" key={scene}>
        <span className="d-cam" />
        {scene === "script" ? (
          <div className="d-editor">
            <span className="d-title">My launch video</span>
            <span className="typing">Hi, I'm Charanjot. Today I'll show you how JOTR keeps…</span>
          </div>
        ) : scene === "float" ? (
          <div className="d-call">
            {Array.from({ length: 4 }, (_, k) => (
              <span key={k}>
                <Silhouette />
              </span>
            ))}
            <div className="d-float">Thanks for joining. Today I'll walk you through…</div>
          </div>
        ) : (
          <>
            <NotchDemo
              className="demo"
              lines={2}
              speed={scene === "hard" ? 560 : 300}
              script={scene === "hard" ? "Our research builds on psycholinguistics, the study of how we read and speak." : "Hi, I'm Charanjot. Today I'll show you how JOTR keeps my eyes on you while I read."}
            />
            <Silhouette className="d-sil" />
          </>
        )}
      </div>
    </div>
  );
}

function DemoPopup({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("jotr.demo.dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // On phones the popup would cover the hero CTA, so it waits until the hero has scrolled away.
    if (window.matchMedia("(max-width: 620px)").matches) {
      const onScroll = () => window.scrollY > window.innerHeight * 0.8 && setVisible(true);
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    const t = window.setTimeout(() => setVisible(true), 1400);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % DEMO_STEPS.length), open ? 3800 : 3000);
    return () => window.clearInterval(id);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("jotr.demo.dismissed", "1");
    } catch {
      // Storage unavailable: dismissal lasts until reload.
    }
  };

  return (
    <>
      {!dismissed && !open && visible && (
        <div className="lg-mini" data-testid="demo-mini">
          <button className="lg-mini-close" onClick={dismiss} aria-label="Close demo">
            {Icon.close}
          </button>
          <button className="lg-mini-body" onClick={() => setOpen(true)} aria-label="Watch the demo">
            <DemoScene step={step} />
            <span className="lg-mini-label">
              <span className="lg-play">{Icon.play}</span> Watch with captions
            </span>
            <span className="lg-mini-progress" key={step} />
          </button>
        </div>
      )}
      {open && (
        <div className="lg-modal" role="dialog" aria-label="JOTR demo" onClick={() => setOpen(false)}>
          <div className="lg-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="lg-modal-close" onClick={() => setOpen(false)} aria-label="Close">
              {Icon.close}
            </button>
            <DemoScene step={step} />
            <div className="lg-demo-caption" key={step}>
              <span className="num">{step + 1}</span> {DEMO_STEPS[step]!.caption}
            </div>
            <div className="lg-demo-dots">
              {DEMO_STEPS.map((s, k) => (
                <button key={s.caption} className={k === step ? "on" : ""} onClick={() => setStep(k)} aria-label={`Step ${k + 1}: ${s.caption}`}>
                  <span />
                </button>
              ))}
            </div>
            <Link to="/app" className="lg-btn lg-btn-ember">
              Try it yourself {Icon.arrow}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
