/**
 * Runs in the user's real Chrome (opened by JOTR Desktop). Chrome's built-in
 * speech recognition (free, multilingual, word by word) listens, and every
 * result goes to the desktop app over a local WebSocket.
 */

type Rec = SpeechRecognition;
const Ctor = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

const title = document.getElementById("title")!;
const state = document.getElementById("state")!;
const heard = document.getElementById("heard")!;
const retry = document.getElementById("retry") as HTMLButtonElement;

let ws: WebSocket | null = null;
let rec: Rec | null = null;
let lang = "en-US";
let wanted = false;
let restarts = 0;
let langs: string[] = [];
let langIndex = 0;

const send = (m: unknown) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
function show(t: string, s: string, err = false) {
  title.textContent = t;
  state.textContent = s;
  document.body.classList.toggle("err", err);
  document.body.classList.toggle("live", !err && wanted && !!rec);
}

/** Chrome knows Punjabi under two tags, Hinglish works best on the Hindi model. */
function candidates(code: string): string[] {
  if (code === "hinglish") return ["hi-IN", "en-IN"];
  if (code.startsWith("pa")) return ["pa-Guru-IN", "pa-IN"];
  return [code];
}

function start(): void {
  if (!Ctor) {
    show("Use Google Chrome", "This browser has no speech recognition. Open JOTR's listener in Google Chrome.", true);
    send({ type: "status", status: "error", detail: "Chrome speech recognition unavailable in this browser" });
    return;
  }
  stop();
  wanted = true;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.lang = langs[langIndex] ?? lang;
  r.onstart = () => {
    restarts = 0;
    show("JOTR is listening", "Keep this window open while you read. You can put it behind other windows.");
    send({ type: "status", status: "on" });
  };
  r.onresult = (e: SpeechRecognitionEvent) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const text = res[0]!.transcript;
      heard.textContent = text.slice(-60);
      send({ type: "transcript", text, isFinal: res.isFinal });
    }
  };
  r.onerror = (e: SpeechRecognitionErrorEvent) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "language-not-supported" && langIndex + 1 < langs.length) {
      langIndex++;
      return; // onend restarts with the next language tag
    }
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      wanted = false;
      retry.hidden = false;
      show("Microphone blocked", "Allow the microphone for this page (click the icon in the address bar), then press the button.", true);
      send({ type: "status", status: "error", detail: "Chrome needs microphone permission for the JOTR listener window" });
      return;
    }
    send({ type: "status", status: "error", detail: `Chrome speech: ${e.error}` });
  };
  r.onend = () => {
    // Chrome stops after silence or about a minute: restart quietly while JOTR wants to listen.
    if (!wanted) return;
    const delay = Math.min(2000, 80 * 2 ** restarts++);
    setTimeout(() => {
      if (!wanted || rec !== r) return;
      r.lang = langs[langIndex] ?? lang;
      try {
        r.start();
      } catch {
        // already started
      }
    }, delay);
  };
  rec = r;
  try {
    r.start();
  } catch {
    // already started
  }
}

function stop(): void {
  wanted = false;
  const r = rec;
  rec = null;
  try {
    r?.abort();
  } catch {
    // not started
  }
  document.body.classList.remove("live");
}

function connect(): void {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    send({ type: "hello" });
    show("JOTR is connected", "Press Start in JOTR. Keep this window open while you read.");
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as { type: string; lang?: string };
    if (m.type === "start") {
      lang = m.lang ?? "en-US";
      langs = candidates(lang);
      langIndex = 0;
      start();
    } else if (m.type === "stop") {
      stop();
      show("JOTR is paused", "Listening resumes when you press Start.");
      heard.textContent = "";
    } else if (m.type === "close") {
      stop();
      window.close();
    }
  };
  ws.onclose = () => {
    stop();
    show("JOTR closed", "Open JOTR again to continue. This window reconnects by itself.", true);
    setTimeout(connect, 2000);
  };
}

retry.addEventListener("click", () => {
  retry.hidden = true;
  langIndex = 0;
  start();
});
connect();
