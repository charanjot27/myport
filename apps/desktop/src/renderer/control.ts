import { estimateDuration, parseScript } from "@promptsense/core";
import { THEMES, type DesktopSettings, type JotrBridge, type Mode, type PrompterState, type Theme } from "../shared/settings";

declare global {
  interface Window {
    jotr: JotrBridge;
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mac = window.jotr.platform === "darwin";
document.body.classList.toggle("mac", mac);
// Show ⌘ on Mac and Ctrl elsewhere in every shortcut hint.
document.querySelectorAll<HTMLElement>("kbd.mod").forEach((k) => (k.textContent = (mac ? "⌥" : "Ctrl+Alt+") + k.textContent));

const HELP: Record<Mode, string> = {
  chrome: "Follows your exact words, word by word, with Chrome's free speech recognition (the same as the JOTR website). Press Start and JOTR opens a small Chrome window that listens: keep it open, behind other windows is fine. Needs Google Chrome and internet.",
  pace: "Scrolls while you talk, at your speaking speed, and waits when you pause. Works offline in any language.",
  words: "Follows your exact words, even when you skip or repeat. Needs a Deepgram API key and an internet connection.",
  steady: "Scrolls at a fixed speed. Pause any time with the shortcut.",
};

let s: DesktopSettings;
const set = (patch: Partial<DesktopSettings>) => void window.jotr.setSettings(patch).then(render);

function render(next: DesktopSettings): void {
  s = next;
  const active = document.activeElement;
  if (active !== $("script")) ($("script") as HTMLTextAreaElement).value = s.script.source;
  if (active !== $("title")) ($("title") as HTMLInputElement).value = s.script.title;
  const parsed = parseScript(s.script.source);
  $("words").textContent = `${parsed.words.length} words`;
  const sec = Math.round(estimateDuration(parsed, s.wpm));
  $("duration").textContent = `about ${sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`} at ${s.wpm} wpm`;

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === s.mode)));
  $("mode-help").textContent = HELP[s.mode];
  $("words-settings").hidden = s.mode !== "words";
  if (active !== $("dg-key")) ($("dg-key") as HTMLInputElement).value = s.deepgramKey;
  ($("language") as HTMLSelectElement).value = s.language;
  $("lang-settings").hidden = s.mode !== "chrome";
  ($("chrome-language") as HTMLSelectElement).value = s.language;

  const slider = (id: string, v: number, text: string) => {
    const el = $(id) as HTMLInputElement;
    if (document.activeElement !== el) el.value = String(v);
    el.style.setProperty("--fill", `${((v - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`);
    $(`${id}-out`).textContent = text;
  };
  slider("wpm", s.wpm, `${s.wpm} wpm`);
  slider("fs", s.fontSize, `${s.fontSize} px`);
  slider("lines", s.lines, String(s.lines));
  slider("width", s.width, `${s.width} px`);

  ($("invisible") as HTMLInputElement).checked = s.invisible;
  ($("glow") as HTMLInputElement).checked = s.voiceGlow;
  ($("mirror") as HTMLInputElement).checked = s.mirror;
  $("pos-help").textContent = s.position
    ? "Floating where you left it. Drop it near the top centre, or press Snap, to put it back under the notch."
    : "Under the notch. Drag the prompter anywhere; drop it near the top to snap back.";
  document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.theme === s.theme)));
  document.documentElement.style.setProperty("--accent", THEMES[s.theme].accent);
}

function renderState(st: PrompterState): void {
  const status = $("status");
  const reading = st.running && !st.paused;
  status.className = `status ${reading ? (st.speaking ? "live" : "on") : st.listening === "error" ? "err" : "off"}`;
  status.textContent = st.listening === "error" ? "Mic needed" : reading ? (st.speaking ? "Listening · speaking" : "Listening") : st.running ? "Paused" : "Ready";
  status.title = st.detail ?? "";
  $("start-label").textContent = reading ? "Pause" : st.running ? "Resume" : "Start";
  $("show-label").textContent = st.visible ? "Hide prompter" : "Show prompter";
}

// Theme swatches
$("themes").append(
  ...(Object.keys(THEMES) as Theme[]).map((t) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.theme = t;
    b.setAttribute("role", "radio");
    b.title = THEMES[t].name;
    b.setAttribute("aria-label", THEMES[t].name);
    b.style.setProperty("--c", THEMES[t].accent);
    b.addEventListener("click", () => set({ theme: t }));
    return b;
  }),
);

let typing: number | undefined;
$("script").addEventListener("input", (e) => {
  clearTimeout(typing);
  const source = (e.target as HTMLTextAreaElement).value;
  typing = window.setTimeout(() => set({ script: { title: s.script.title, source } }), 350);
});
$("title").addEventListener("input", (e) => set({ script: { title: (e.target as HTMLInputElement).value, source: s.script.source } }));
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) set({ script: { title: f.name.replace(/\.(txt|md)$/i, ""), source: await f.text() } });
});
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => set({ mode: b.dataset.mode as Mode })));
$("dg-key").addEventListener("change", (e) => set({ deepgramKey: (e.target as HTMLInputElement).value.trim() }));
$("chrome-language").addEventListener("change", (e) => set({ language: (e.target as HTMLSelectElement).value }));
$("language").addEventListener("change", (e) => set({ language: (e.target as HTMLSelectElement).value }));
const num = (id: string, key: "wpm" | "fontSize" | "lines" | "width") => $(id).addEventListener("input", (e) => set({ [key]: Number((e.target as HTMLInputElement).value) }));
num("wpm", "wpm");
num("fs", "fontSize");
num("lines", "lines");
num("width", "width");
$("invisible").addEventListener("change", (e) => set({ invisible: (e.target as HTMLInputElement).checked }));
$("glow").addEventListener("change", (e) => set({ voiceGlow: (e.target as HTMLInputElement).checked }));
$("mirror").addEventListener("change", (e) => set({ mirror: (e.target as HTMLInputElement).checked }));
$("snap").addEventListener("click", () => window.jotr.send("snap"));
$("start").addEventListener("click", () => window.jotr.send("toggle-pause"));
$("show").addEventListener("click", () => window.jotr.send("toggle"));
document.querySelectorAll<HTMLAnchorElement>("a.ext").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.jotr.openExternal(a.href);
  }),
);

void window.jotr.getSettings().then(render);
window.jotr.onSettings(render);
window.jotr.onState(renderState);
