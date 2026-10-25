import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, Silhouette } from "./landing-icons";
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
      <Showcase />
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
      <NotchDemo />
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

/** A laptop that tilts upright as it scrolls into view (CSS scroll-driven animation where supported). */
function Showcase() {
  return (
    <section className="lg-showcase" aria-label="JOTR on a laptop during a video call">
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

function Features() {
  return (
    <section className="lg-paper" id="features">
      <div className="lg-section">
        <div className="lg-head" data-reveal>
          <span className="lg-eyebrow dark">Features</span>
          <h2>
            More than a <span className="lg-ember-text">teleprompter</span>
          </h2>
          <p>Speak naturally, stay in control, and get better with every take.</p>
        </div>
        <div className="lg-bento">
          <Feature icon={Icon.voice} title="Follows your voice" text="Scrolls as you speak. Pause, skip, repeat or ad-lib and it finds you again." wide d={0}>
            <div className="pv-voice">
              <div className="wave">
                {Array.from({ length: 28 }, (_, k) => (
                  <i key={k} style={{ animationDelay: `${(k * 73) % 900}ms` }} />
                ))}
              </div>
              <p>
                <span className="said">Today I'll show you </span>
                <span className="now">how</span> <span>it follows me.</span>
              </p>
            </div>
          </Feature>
          <Feature icon={Icon.bolt} title="Predicts stumbles" text="Tracks your eyes against your voice and slows down before a hard word." d={60}>
            <div className="pv-stumble">
              <span>…built on </span>
              <b>psycholinguistics</b>
            </div>
          </Feature>
          <Feature icon={Icon.window} title="Floats over any app" text="An always-on-top window for Meet, Zoom, Teams or any tab." dark d={120}>
            <div className="pv-float">
              <div className="desk">
                <span />
                <span />
                <span />
              </div>
              <div className="win">Hi everyone, thanks for…</div>
            </div>
          </Feature>
          <Feature icon={Icon.glasses} title="No glare, auto brightness" text="Measures your room and your glasses through the camera and dims the text until no reflection shows." wide d={0}>
            <div className="pv-bright">
              <span className="lbl">Text brightness</span>
              <div className="track">
                <i />
              </div>
              <span className="val">auto</span>
            </div>
          </Feature>
          <Feature icon={Icon.eye} title="Natural eye contact" text="Corrects your gaze only while you read. Glances and pauses stay human." d={60} />
          <Feature icon={Icon.shield} title="Verified live" text="A screen-light check proves it's really you, live, not a recording or a deepfake." d={120}>
            <div className="pv-live">
              <i />
              <i />
              <i />
              <i />
              <b>Verified live</b>
            </div>
          </Feature>
          <Feature icon={Icon.chart} title="Coach report" text="Pace, filler words, stumbles, eye contact and posture after every take." d={0} />
          <Feature icon={Icon.hand} title="Hands-free control" text="Open palm to pause, peace sign to jump a section." d={60} />
          <Feature icon={Icon.lock} title="Private by design" text="Video is processed on your device. Nothing uploaded, nothing stored." d={120} />
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, text, wide, dark, d, children }: { icon: ReactNode; title: string; text: string; wide?: boolean; dark?: boolean; d: number; children?: ReactNode }) {
  const ref = useTilt<HTMLElement>(3);
  return (
    <div className={`lg-feature-cell${wide ? " wide" : ""}`} data-reveal style={{ ["--d" as string]: `${d}ms` }}>
      <article ref={ref} className={`lg-feature${dark ? " dark" : ""}`}>
        <div className="lg-ficon">{icon}</div>
        <h3>{title}</h3>
        <p>{text}</p>
        {children && <div className="lg-preview">{children}</div>}
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
