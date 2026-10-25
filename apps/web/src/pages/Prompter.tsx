import { parseScript, ReadingGate, readingFeatures, readingProbability, FusionTimeline, type ParsedScript } from "@promptsense/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { openMedia, stopMedia } from "../lib/media";
import { recordings } from "../lib/recordings";
import { getSettings, updateSettings, useSettings } from "../lib/settings";
import { sessions, scripts, type StoredScript } from "../lib/storage";
import { uploadSessionSummary } from "../lib/sync";
import { formatDuration } from "../lib/format";
import { OnnxStumblePredictor } from "../models/onnxStumble";
import { PrompterEngine, type HudState } from "../prompter/engine";
import { ScriptLayout } from "../prompter/layout";
import { ScriptText, WordHighlighter } from "../prompter/ScriptText";
import { SessionRecorder } from "../recording/recorder";
import { createSpeechProvider, type SpeechProvider } from "../speech";
import { sharedVision } from "../vision/visionEngine";
import { VideoProcessor } from "../vision/videoProcessor";

type Phase = "loading" | "ready" | "countdown" | "running" | "saving" | "missing";

export function PrompterPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const [stored, setStored] = useState<StoredScript | null>(null);
  const [script, setScript] = useState<ParsedScript | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState("");
  const [visionStatus, setVisionStatus] = useState<"off" | "loading" | "on" | "failed">("off");
  const [record, setRecord] = useState(false);
  const [research, setResearch] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camSlotRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PrompterEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<SpeechProvider | null>(null);
  const layoutRef = useRef(new ScriptLayout());
  const highlighterRef = useRef(new WordHighlighter());
  const processorRef = useRef<VideoProcessor | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const gateRef = useRef(new ReadingGate());
  const hideTimer = useRef(0);

  // Load the script.
  useEffect(() => {
    void scripts.get(id).then((s) => {
      if (!s || s.deleted) {
        setPhase("missing");
        return;
      }
      setStored(s);
      setScript(parseScript(s.source));
      setPhase("ready");
    });
  }, [id]);

  // Measure layout after render and on resize / font changes.
  const remeasure = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;
    layoutRef.current.measure(content);
    highlighterRef.current.attach(content);
    engineRef.current?.setViewport(viewport.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!script) return;
    remeasure();
    const ro = new ResizeObserver(() => remeasure());
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [script, settings.fontSize, settings.lineWidth, remeasure]);

  // Apply highlights from the HUD.
  useEffect(() => {
    if (hud) highlighterRef.current.update(hud.currentWord, settings.stumbleAssist ? hud.hardWord : null);
  }, [hud?.currentWord, hud?.hardWord, settings.stumbleAssist]); // eslint-disable-line react-hooks/exhaustive-deps

  const teardown = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    const vision = sharedVision();
    vision.stop();
    vision.onFrame = null;
    stopMedia(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    engineRef.current?.stop();
    teardown();
  }, [teardown]);

  const start = async () => {
    if (!script || !stored) return;
    setError("");
    const s = getSettings();
    const needVideo = s.showCamera || s.pauseOnLookAway || s.gestureControl || !!s.gazeModel || record;
    let stream: MediaStream | null = null;
    try {
      stream = await openMedia({ video: needVideo, audio: s.speechProvider !== "none" || record, cameraId: s.cameraId, micId: s.micId });
    } catch (e) {
      setError((e as Error).message);
      if (s.speechProvider !== "none") return;
    }
    streamRef.current = stream;

    const engine = new PrompterEngine({ script, scriptId: stored.id, scriptTitle: stored.title, settings: s, layout: layoutRef.current, research });
    engineRef.current = engine;
    engine.subscribe(setHud);
    engine.onScroll((px) => {
      if (contentRef.current) contentRef.current.style.transform = `translate3d(0, ${-px}px, 0)`;
    });
    remeasure();

    // Background: trained stumble model if one is deployed.
    void OnnxStumblePredictor.load().then((p) => p && engine.setPredictor(p));

    // Countdown gives the speaker a beat to look at the text.
    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    setPhase("running");
    engine.start(stream);

    if (stream && stream.getVideoTracks().length && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      void startVision(engine, video);
    }

    if (stream && s.speechProvider !== "none" && s.scrollMode === "voice") {
      const keyterms = [...new Set(script.words.filter((w) => w.difficulty >= 0.5).map((w) => w.display.replace(/[^\p{L}\p{N}'-]/gu, "")))].filter(Boolean);
      const provider = createSpeechProvider(s.speechProvider, { language: s.language, keyterms, apiUrl: s.apiUrl });
      if (provider) {
        provider.onResult = (r) => engine.handleSpeech(r);
        provider.onStatus = (st, detail) => engine.handleSpeechStatus(st, detail);
        speechRef.current = provider;
        await provider.start(stream);
      }
    }
  };

  const startVision = async (engine: PrompterEngine, video: HTMLVideoElement) => {
    const s = getSettings();
    const vision = sharedVision();
    const wantsEffects = record && (s.eyeContact || s.cornealShield);
    try {
      setVisionStatus("loading");
      await vision.load({ hands: s.gestureControl });
      vision.options = { hands: s.gestureControl, skin: false };
      if (wantsEffects || record) {
        processorRef.current ??= new VideoProcessor();
        const canvas = processorRef.current.canvas;
        if (camSlotRef.current && !camSlotRef.current.contains(canvas)) {
          camSlotRef.current.replaceChildren(canvas);
        }
      }
      const region = { x0: 0, y0: 0, x1: 1, y1: 0.75 };
      let lastT = performance.now();
      vision.onFrame = (f) => {
        engine.handleVision(f);
        const p = processorRef.current;
        if (p && (record || wantsEffects)) {
          const now = performance.now();
          let eyeWeight = 0;
          if (s.eyeContact && s.gazeModel) {
            const recent = FusionTimeline.since(engine.timeline.gaze, (engine.timeline.gaze.last()?.t ?? 0) - 1500);
            const prob = readingProbability(readingFeatures(recent, region));
            eyeWeight = gateRef.current.update(prob, now - lastT, f.face?.features.blink ?? false);
          }
          lastT = now;
          p.process(video, { landmarks: f.face?.landmarks ?? null, eyeContact: eyeWeight, shield: s.cornealShield });
        }
      };
      vision.start(video);
      setVisionStatus("on");
      if (record && processorRef.current?.supported) {
        recorderRef.current = new SessionRecorder();
        recorderRef.current.start(processorRef.current.canvas, streamRef.current);
      }
    } catch (e) {
      console.error(e);
      setVisionStatus("failed");
      setError("Vision models could not load. Voice following still works; look-away pause, gaze and gestures are off.");
      if (record && videoRef.current?.srcObject) {
        // Record the raw camera when processing is unavailable.
        const c = document.createElement("canvas");
        const v = videoRef.current;
        c.width = v.videoWidth || 1280;
        c.height = v.videoHeight || 720;
        const ctx = c.getContext("2d")!;
        const draw = () => {
          if (!streamRef.current) return;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          requestAnimationFrame(draw);
        };
        draw();
        recorderRef.current = new SessionRecorder();
        recorderRef.current.start(c, streamRef.current);
      }
    }
  };

  const stop = async () => {
    const engine = engineRef.current;
    if (!engine || !stored) return;
    setPhase("saving");
    const blob = (await recorderRef.current?.stop()) ?? null;
    recorderRef.current = null;
    teardown();
    const rec = engine.stop();
    engineRef.current = null;
    await sessions.put({ id: rec.id, scriptId: rec.scriptId, scriptTitle: rec.scriptTitle, startedAt: rec.startedAt, durationMs: rec.durationMs, record: rec, research });
    if (blob) recordings.set(rec.id, blob);
    void uploadSessionSummary(rec).catch(() => undefined);
    navigate(`/report/${rec.id}`);
  };

  // Keyboard control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = getSettings();
      switch (e.key) {
        case " ":
          e.preventDefault();
          engine?.command("toggle_pause");
          break;
        case "Escape":
          if (engine) void stop();
          else navigate(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          engine?.nudge(s.fontSize * 1.5);
          break;
        case "ArrowUp":
          e.preventDefault();
          engine?.nudge(-s.fontSize * 1.5);
          break;
        case "ArrowRight":
        case "PageDown":
          engine?.command("next_section");
          break;
        case "ArrowLeft":
        case "PageUp":
          engine?.command("previous_section");
          break;
        case "r":
          engine?.command("rewind_sentence");
          break;
        case "m":
          updateSettings({ mirror: !s.mirror });
          break;
        case "+":
        case "=":
          updateSettings({ fontSize: Math.min(120, s.fontSize + 4) });
          break;
        case "-":
          updateSettings({ fontSize: Math.max(18, s.fontSize - 4) });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so `stop` sees fresh state

  // Wheel / touch scrolling for manual and fixed modes, and in voice mode to correct the position.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engineRef.current?.nudge(e.deltaY);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [script]);

  // Auto-hide the toolbar while running.
  const poke = () => {
    setToolbarVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setToolbarVisible(false), 3000);
  };

  if (phase === "missing") {
    return (
      <main className="page">
        <h1>Script not found</h1>
        <Link to="/">Back to scripts</Link>
      </main>
    );
  }

  const running = phase === "running";
  const banner = !hud || !running
    ? null
    : hud.paused
      ? "Paused · press Space or show an open palm to resume"
      : hud.pauseReason === "look-away"
        ? "Paused while you look away"
        : hud.speechStatus === "error" || hud.speechStatus === "unsupported"
          ? hud.speechDetail ?? "Speech recognition unavailable"
          : hud.offScript
            ? "Off script · keep going, I'll find you when you're back"
            : null;

  return (
    <div className={`prompter${settings.mirror ? " mirrored" : ""}`} onMouseMove={poke} data-testid="prompter">
      <div className="viewport" ref={viewportRef}>
        <div
          className="content"
          ref={contentRef}
          style={{ fontSize: settings.fontSize, maxWidth: `${settings.lineWidth}ch`, paddingTop: `${settings.readingLine * 100}vh` }}
        >
          {script && <ScriptText script={script} onWordClick={(i) => engineRef.current?.seekWord(i)} />}
        </div>
        <div className="reading-line" style={{ top: `calc(${settings.readingLine * 100}vh + ${settings.fontSize * 0.72}px)` }} />
      </div>

      {settings.stumbleAssist && running && hud && (
        <div className="risk" title={`Stumble risk (${hud.predictor})`}>
          <div style={{ height: `${Math.round(hud.risk * 100)}%` }} />
        </div>
      )}
      {banner && <div className="banner" role="status">{banner}</div>}
      {hud?.gazePoint && running && (
        <div className="gaze-dot" style={{ left: `${hud.gazePoint.x * 100}%`, top: `${hud.gazePoint.y * 100}%` }} aria-hidden />
      )}

      <div className="cam" style={{ display: settings.showCamera && running ? "block" : "none" }}>
        <div ref={camSlotRef} />
        <video ref={videoRef} muted playsInline style={{ display: processorRef.current && (record || settings.eyeContact) ? "none" : "block" }} />
      </div>

      <div className={`toolbar${running && !toolbarVisible ? " hidden" : ""}`}>
        <Link to="/" className="btn small" onClick={() => teardown()}>
          ← Scripts
        </Link>
        {running ? (
          <>
            <button className="btn small primary" onClick={() => void stop()} data-testid="stop">
              ■ Finish
            </button>
            <button className="btn small" onClick={() => engineRef.current?.command("toggle_pause")}>
              {hud?.paused ? "▶ Resume" : "❚❚ Pause"}
            </button>
            <button className="btn small" onClick={() => engineRef.current?.command("rewind_sentence")} title="Rewind sentence (R)">
              ↺ Sentence
            </button>
          </>
        ) : null}
        <select
          aria-label="Scroll mode"
          value={settings.scrollMode}
          onChange={(e) => {
            const mode = e.target.value as typeof settings.scrollMode;
            updateSettings({ scrollMode: mode });
            engineRef.current?.setMode(mode);
          }}
          style={{ width: "auto", padding: "4px 8px", background: "#1e1e1e" }}
        >
          <option value="voice">Follow voice</option>
          <option value="fixed">Fixed speed</option>
          <option value="manual">Manual</option>
        </select>
        <button className="btn small" onClick={() => updateSettings({ fontSize: Math.max(18, settings.fontSize - 4) })} aria-label="Smaller text">
          A−
        </button>
        <button className="btn small" onClick={() => updateSettings({ fontSize: Math.min(120, settings.fontSize + 4) })} aria-label="Larger text">
          A+
        </button>
        <button className="btn small" onClick={() => updateSettings({ mirror: !settings.mirror })} aria-pressed={settings.mirror}>
          Mirror
        </button>
        <div className="grow" />
        {running && hud && (
          <>
            <StatusChip ok={hud.speechStatus === "listening"} warn={hud.speechStatus === "starting"} label={hud.speaking ? "speaking" : `mic: ${hud.speechStatus}`} />
            <StatusChip ok={visionStatus === "on" && hud.faceFound} warn={visionStatus === "loading"} label={visionStatus === "on" ? (hud.faceFound ? "face" : "no face") : `vision: ${visionStatus}`} />
            {settings.gestureControl && hud.gestureProgress > 0 && <GestureRing progress={hud.gestureProgress} label={hud.gesture} />}
            {recorderRef.current?.recording && <StatusChip ok={false} warn={false} bad label="REC" />}
            <span className="chip">{formatDuration(hud.elapsedMs / 1000)}</span>
          </>
        )}
      </div>

      {(phase === "ready" || phase === "loading") && (
        <div className="overlay">
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>{stored?.title ?? "Loading…"}</h2>
            <p className="muted">
              Speak naturally. The text follows your voice. Pause with <kbd>Space</kbd>, rewind a sentence with <kbd>R</kbd>, jump sections with <kbd>←</kbd>/<kbd>→</kbd>, finish with <kbd>Esc</kbd>.
            </p>
            {settings.speechProvider === "webspeech" && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Using your browser's speech recognition. In Chrome, audio is processed by Google. Video always stays on this device.
              </p>
            )}
            <label className="check">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
              <span>
                Record this take to a video file{settings.cornealShield ? " (with corneal reflection shield)" : ""}
                {settings.eyeContact ? " and eye-contact correction" : ""}
              </span>
            </label>
            {settings.researchConsent && (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />
                <span>Save as a research session (full-rate gaze and features, for model training)</span>
              </label>
            )}
            {error && <div className="alert error">{error}</div>}
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn primary" disabled={!script} onClick={() => void start()} data-testid="start">
                Start
              </button>
              <Link className="btn" to={`/edit/${id}`}>
                Edit script
              </Link>
            </div>
          </div>
        </div>
      )}
      {phase === "countdown" && (
        <div className="overlay">
          <div className="countdown" aria-live="assertive">
            {count}
          </div>
        </div>
      )}
      {phase === "saving" && (
        <div className="overlay">
          <div className="panel">Saving your session…</div>
        </div>
      )}
      {running && error && (
        <div className="banner" style={{ top: 60 }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusChip({ ok, warn, bad, label }: { ok: boolean; warn: boolean; bad?: boolean; label: string }) {
  return (
    <span className={`chip ${bad ? "bad" : ok ? "good" : warn ? "warn" : ""}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

function GestureRing({ progress, label }: { progress: number; label: string }) {
  const c = 2 * Math.PI * 14;
  return (
    <span className="chip" title={label}>
      <svg className="gesture-ring" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#444" strokeWidth="4" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="#2f81f7" strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 18 18)" />
      </svg>
      {label.replace("_", " ")}
    </span>
  );
}
