import { detectScriptLanguage, parseScript, ReadingPace, ScriptAligner, syllables, wordAtToken, type ParsedScript } from "@promptsense/core";
import { THEMES, type Command, type DesktopSettings, type JotrBridge, type PrompterState } from "../shared/settings";
import { connectDeepgram } from "./deepgram";
import { startVoice, type VoiceFrame } from "./voice";

declare global {
  interface Window {
    jotr: JotrBridge;
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = $("notch");
const textEl = $("text");
const viewport = $("viewport");
const caret = $("caret");
const playBtn = $<HTMLButtonElement>("play");
const pill = $("pill");
const pillCount = $("pill-count");
const pillTitle = $("pill-title");
const prevBtn = $<HTMLButtonElement>("prev");
const nextBtn = $<HTMLButtonElement>("next");
const mod = window.jotr.platform === "darwin" ? "⌘⇧" : "Ctrl+Shift+";

let settings: DesktopSettings;
let script: ParsedScript;
let spans: HTMLSpanElement[] = [];
let lines: Array<{ top: number; first: number; last: number }> = [];
let lineHeight = 24;
let avgSyllables = 1.4;

/** Fractional word position the reader is at. */
let pos = 0;
let shownWord = -1;
let shownLine = -1;
let running = false;
let paused = false;
let scrollY = 0;
let scrollV = 0;

let voice: { stream: MediaStream; stop: () => void } | null = null;
let stopWords: (() => void) | null = null;
let aligner: ScriptAligner | null = null;
const pace = new ReadingPace({ lead: 0.8 });
let listening: PrompterState["listening"] = "off";
let detail: string | undefined;
let frame: VoiceFrame = { level: 0, speaking: false, pitch: 0.2, hz: 0, syllableRate: 0 };
let glowLvl = 0;
let glowPitch = 0.2;
let measuredRate = 0;
let hint: string | null = null;
let hintUntil = 0;

// ------------------------------------------------------------------ script

function loadScript(source: string): void {
  script = parseScript(source || " ");
  textEl.replaceChildren(
    ...script.words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w.display;
      s.dataset.i = String(i);
      return s;
    }),
  );
  spans = Array.from(textEl.children) as HTMLSpanElement[];
  // Average syllables per word turns "syllables per second" into "words per second", in any language.
  const sample = script.words.slice(0, 400);
  const total = sample.reduce((n, w) => {
    const word = w.display.toLowerCase();
    return n + (/^[\p{Script=Latin}\d'’.,!?:;"-]+$/u.test(word) ? syllables(word) : Math.max(1, Math.round([...word].length / 2.2)));
  }, 0);
  avgSyllables = sample.length ? Math.max(1, total / sample.length) : 1.4;
  aligner = new ScriptAligner(script);
  pos = Math.min(pos, script.words.length);
  shownWord = shownLine = -1;
  requestAnimationFrame(measure);
}

function measure(): void {
  lines = [];
  let cur: (typeof lines)[number] | null = null;
  spans.forEach((s, i) => {
    const top = s.offsetTop;
    if (!cur || Math.abs(top - cur.top) > 4) {
      cur = { top, first: i, last: i };
      lines.push(cur);
    } else cur.last = i;
  });
  lineHeight = settings.fontSize * 1.5;
  shownWord = shownLine = -1;
  render();
}

const lineOf = (w: number) => {
  const i = lines.findIndex((l) => w >= l.first && w <= l.last);
  return i < 0 ? lines.length - 1 : i;
};

/** Scroll offset: a line holds still while it is read, then glides up as its last word is spoken. */
function targetTop(p: number): number {
  if (!lines.length) return 0;
  const w = Math.max(0, Math.min(spans.length - 1, Math.floor(p)));
  const li = lineOf(w);
  const line = lines[li]!;
  const next = lines[li + 1];
  const span = (next ? next.top : line.top + lineHeight) - line.top;
  const t = Math.max(0, Math.min(1, (p - (line.last + 0.45)) / 0.55));
  return line.top + t * t * (3 - 2 * t) * span;
}

function render(): void {
  if (!spans.length) return;
  const w = Math.min(spans.length - 1, Math.floor(pos));
  const li = lineOf(w);
  if (w !== shownWord || li !== shownLine) {
    const line = lines[li];
    const prevLine = lines[shownLine];
    const all = shownWord < 0;
    const from = all ? 0 : Math.max(0, Math.min(shownWord, w, prevLine?.first ?? w, line?.first ?? w) - 1);
    const to = all ? spans.length - 1 : Math.min(spans.length - 1, Math.max(shownWord, w, prevLine?.last ?? w, line?.last ?? w) + 1);
    for (let i = from; i <= to; i++) {
      const inLine = !!line && i >= line.first && i <= line.last;
      spans[i]!.className = i === w ? "w now" : i < w ? (inLine ? "w line said" : "w said") : inLine ? "w line" : "w";
    }
    shownWord = w;
    shownLine = li;
  }
  root.style.setProperty("--progress", (pos / spans.length).toFixed(4));
}

// ------------------------------------------------------------------- voice

async function start(): Promise<void> {
  if (pos >= spans.length - 0.01) pos = 0;
  running = true;
  paused = false;
  if (settings.mode !== "steady" || settings.voiceGlow) await openMic();
  if (settings.mode === "words") startWords();
  report();
}

async function openMic(): Promise<void> {
  if (voice) return;
  listening = "starting";
  report();
  try {
    voice = await startVoice((f) => (frame = f));
    listening = "on";
    detail = undefined;
  } catch (e) {
    listening = "error";
    detail = `Microphone unavailable (${(e as Error).message}). Allow JOTR in System Settings → Privacy & Security → Microphone.`;
    showHint("Allow the microphone for JOTR in System Settings");
  }
  report();
}

function startWords(): void {
  stopWords?.();
  stopWords = null;
  if (!voice) return;
  if (!settings.deepgramKey) {
    showHint("Add a Deepgram key to follow your words · using voice pace");
    return;
  }
  const lang = settings.language === "auto" ? ({ hi: "hi-IN", pa: "pa-IN" } as Record<string, string>)[detectScriptLanguage(settings.script.source)] ?? "en-US" : settings.language;
  aligner = new ScriptAligner(script);
  pace.reset(pos);
  stopWords = connectDeepgram(
    voice.stream,
    settings.deepgramKey,
    lang,
    (t) => {
      const u = aligner!.update(t.text, t.isFinal, performance.now());
      if (!u.offScript && script.words.length) pace.confirm(wordAtToken(script, Math.max(0, u.position - 1)), performance.now());
    },
    (s, d) => {
      if (s === "error") showHint(d ?? "Speech service error");
      detail = d;
      report();
    },
  );
}

function stopMic(): void {
  stopWords?.();
  stopWords = null;
  voice?.stop();
  voice = null;
  listening = "off";
}

function pause(on = !paused): void {
  paused = on;
  report();
}

function showHint(text: string, ms = 5000): void {
  hint = text;
  hintUntil = performance.now() + ms;
  renderPill();
}

/** Jump to a word, keeping voice-following in step. */
function jump(word: number): void {
  pos = Math.max(0, Math.min(spans.length, word));
  pace.reset(pos);
  aligner?.seek(script.words[Math.floor(pos)]?.tokenStart ?? script.tokens.length);
  render();
  renderPill();
}

// ------------------------------------------------------------- the pill

function currentSection(): number {
  const w = Math.floor(pos);
  let idx = 0;
  script.sections.forEach((s, i) => {
    if (w >= s.wordStart) idx = i;
  });
  return idx;
}

const MODE_LABEL = { pace: "Voice pace", words: "Following your words", steady: "Steady" } as const;

function renderPill(): void {
  const now = performance.now();
  const hasSections = script.sections.filter((s) => s.title).length > 1;
  const i = currentSection();
  if (hint && now < hintUntil) {
    pillCount.textContent = "";
    pillTitle.textContent = hint;
    pill.classList.add("show");
  } else {
    hint = null;
    pill.classList.toggle("show", !running);
    if (hasSections) {
      pillCount.textContent = `${i + 1}/${script.sections.length}`;
      pillTitle.textContent = script.sections[i]?.title || "Intro";
    } else {
      pillCount.textContent = running ? `${Math.round((pos / Math.max(1, spans.length)) * 100)}%` : "";
      pillTitle.textContent = running ? (paused ? "Paused" : settings.mode === "steady" ? `Steady · ${settings.wpm} wpm` : MODE_LABEL[settings.mode]) : `Press ▶ or ${mod}Space to start`;
    }
  }
  prevBtn.disabled = pos <= 0;
  nextBtn.disabled = hasSections ? i >= script.sections.length - 1 : pos >= spans.length - 1;
}

function section(dir: -1 | 1): void {
  if (script.sections.length > 1) {
    const i = currentSection();
    const startOf = script.sections[i]!.wordStart;
    // Back from the middle of a section goes to its start first.
    const target = dir < 0 && Math.floor(pos) > startOf + 1 ? startOf : script.sections[Math.max(0, Math.min(script.sections.length - 1, i + dir))]!.wordStart;
    jump(target);
  } else {
    command(dir < 0 ? "back" : "forward");
  }
}

// -------------------------------------------------------------------- loop

let last = performance.now();
let lastReport = 0;
let lastPill = 0;
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (running && !paused && spans.length) {
    const base = settings.wpm / 60;
    if (settings.mode === "steady") {
      pos += base * dt;
    } else if (settings.mode === "words" && stopWords) {
      pos = pace.step(dt * 1000, frame.speaking);
    } else if (frame.speaking) {
      // Voice pace: your measured syllable rate turned into words, blended with your usual pace.
      if (frame.syllableRate > 0) measuredRate += (frame.syllableRate / avgSyllables - measuredRate) * Math.min(1, dt * 0.8);
      const rate = measuredRate > 0 ? Math.max(base * 0.6, Math.min(base * 1.8, 0.4 * base + 0.6 * measuredRate)) : base;
      pos += rate * dt;
    }
    if (pos >= spans.length) {
      pos = spans.length;
      running = false;
      showHint("The end · press ▶ to read it again");
      report();
    }
  }

  // Critically damped scroll toward the reading position.
  const target = targetTop(pos);
  const k = 140;
  scrollV += (k * (target - scrollY) - 2 * Math.sqrt(k) * scrollV) * dt;
  scrollY += scrollV * dt;
  if (Math.abs(target - scrollY) < 0.2 && Math.abs(scrollV) < 1) scrollY = target;
  textEl.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
  render();
  const line = lines[lineOf(Math.min(spans.length - 1, Math.floor(pos)))];
  if (line) caret.style.transform = `translate3d(0, ${line.top - scrollY + lineHeight * 0.14}px, 0)`;

  // Voice glow: rises with a higher voice, brightens when you speak louder.
  const want = settings.voiceGlow && listening === "on" && running && !paused;
  glowLvl += ((want && frame.speaking ? 0.25 + frame.level * 0.75 : 0.06) - glowLvl) * Math.min(1, dt * 9);
  glowPitch += ((want ? frame.pitch : 0.12) - glowPitch) * Math.min(1, dt * 6);
  root.style.setProperty("--lvl", glowLvl.toFixed(3));
  root.style.setProperty("--pitch", glowPitch.toFixed(3));
  root.classList.toggle("speaking", frame.speaking && want);

  if (now - lastPill > 250) {
    lastPill = now;
    renderPill();
  }
  if (now - lastReport > 500) report();
  requestAnimationFrame(tick);
}

function report(): void {
  lastReport = performance.now();
  playBtn.dataset.state = running && !paused ? "pause" : "play";
  playBtn.setAttribute("aria-label", running && !paused ? "Pause" : "Start");
  window.jotr.reportState({
    visible: document.visibilityState === "visible",
    running,
    paused,
    progress: spans.length ? pos / spans.length : 0,
    speaking: frame.speaking,
    listening,
    detail,
  });
}

// --------------------------------------------------------------- settings

function apply(s: DesktopSettings): void {
  const prev = settings;
  settings = s;
  const theme = THEMES[s.theme];
  root.style.setProperty("--fs", `${s.fontSize}px`);
  root.style.setProperty("--lines", String(s.lines));
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--glow", theme.glow);
  root.classList.toggle("mirrored", s.mirror);
  if (!prev || prev.script.source !== s.script.source) {
    if (prev) pos = 0;
    loadScript(s.script.source);
  } else if (prev.fontSize !== s.fontSize || prev.width !== s.width || prev.lines !== s.lines) {
    requestAnimationFrame(measure);
  }
  if (prev && running && (prev.mode !== s.mode || prev.deepgramKey !== s.deepgramKey || prev.language !== s.language)) {
    if (s.mode === "words") startWords();
    else {
      stopWords?.();
      stopWords = null;
    }
  }
  renderPill();
}

function command(c: Command): void {
  switch (c) {
    case "start":
      void start();
      break;
    case "pause":
      pause(true);
      break;
    case "toggle-pause":
      if (!running) void start();
      else pause();
      break;
    case "restart":
      jump(0);
      void start();
      break;
    case "back":
    case "forward": {
      const li = lineOf(Math.floor(pos));
      const to = lines[Math.max(0, Math.min(lines.length - 1, li + (c === "back" ? -1 : 1)))];
      if (to) jump(to.first);
      break;
    }
    case "prev-section":
      section(-1);
      break;
    case "next-section":
      section(1);
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ events

playBtn.addEventListener("click", () => command("toggle-pause"));
$("restart").addEventListener("click", () => command("restart"));
$("editor").addEventListener("click", () => window.jotr.send("editor"));
$("close").addEventListener("click", () => window.jotr.send("hide"));
prevBtn.addEventListener("click", () => section(-1));
nextBtn.addEventListener("click", () => section(1));

// Manual scrolling: trackpad or mouse wheel over the text moves through the script, line by line.
let wheel = 0;
viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    wheel += e.deltaY * (e.deltaMode === 1 ? lineHeight : 1);
    const step = lineHeight * 0.8;
    while (Math.abs(wheel) >= step) {
      command(wheel > 0 ? "forward" : "back");
      wheel -= Math.sign(wheel) * step;
    }
  },
  { passive: false },
);
// Click a word to continue from there.
textEl.addEventListener("click", (e) => {
  const i = (e.target as HTMLElement).dataset?.i;
  if (i !== undefined) jump(Number(i));
});
window.addEventListener("keydown", (e) => {
  if (e.key === " ") command("toggle-pause");
  else if (e.key === "ArrowUp") command("back");
  else if (e.key === "ArrowDown") command("forward");
  else if (e.key === "ArrowLeft") section(-1);
  else if (e.key === "ArrowRight") section(1);
  else if (e.key === "Escape") window.jotr.send("hide");
});
window.addEventListener("resize", () => requestAnimationFrame(measure));

void (async () => {
  apply(await window.jotr.getSettings());
  window.jotr.onSettings(apply);
  window.jotr.onCommand(command);
  window.jotr.onLayout((l) => {
    root.classList.toggle("floating", l.floating);
    root.classList.toggle("notched", l.notched);
    root.style.setProperty("--top", `${l.topInset}px`);
    requestAnimationFrame(measure);
  });
  void document.fonts?.ready.then(() => measure());
  report();
  requestAnimationFrame(tick);
})();

window.addEventListener("beforeunload", stopMic);
