import { detectScriptLanguage, detectStumbles, parseScript, ReadingGate, readingFeatures, readingProbability, FusionTimeline, type ParsedScript } from "@promptsense/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdaptiveBrightness, AmbientMeter } from "../lib/adaptive";
import { focusFrame, isPhone, safeAreaTop, textColor, type FocusFrame } from "../lib/device";
import { EyeGlareMeter } from "../lib/reflection";
import { openMedia, stopMedia } from "../lib/media";
import { PhoneFloat } from "../components/PhoneFloat";
import { closeFloatingWindow, floatingSupported, floatingUnavailableReason, openFloatingWindow } from "../lib/pip";
import { recordings } from "../lib/recordings";
import { getSettings, updateSettings, useSettings } from "../lib/settings";
import { htmlLang, resolveLanguage } from "../lib/languages";
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
import { VideoProcessor } from "@promptsense/core/browser";

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
  // Messages shown during a take (like "floating isn't available here") fade after a few seconds.
  useEffect(() => {
    if (!error || phase !== "running") return;
    const t = setTimeout(() => setError(""), 7000);
    return () => clearTimeout(t);
  }, [error, phase]);
  const [visionStatus, setVisionStatus] = useState<"off" | "loading" | "on" | "failed">("off");
  const [record, setRecord] = useState(false);
  const [research, setResearch] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  /** The floating always-on-top window, when the prompter has been popped out. */
  const [pip, setPip] = useState<Window | null>(null);
  const visionVideoRef = useRef<HTMLVideoElement | null>(null);
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const pipRootRef = useRef<HTMLDivElement>(null);
  const adaptiveRef = useRef<AdaptiveBrightness | null>(null);
  const [autoInfo, setAutoInfo] = useState<string>("");

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

  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
  }, []);

  // Camera layout: a few lines right under the webcam. Full layout: the classic full-screen prompter.
  const cameraLayout = settings.layout === "camera";
  // On phones the text hangs from the camera cut-out (Dynamic Island / punch-hole), at a phone-sized font.
  const phone = isPhone();
  const safeTop = useMemo(() => (phone ? safeAreaTop() : 0), [phone, win.w, win.h]);
  const frame: FocusFrame | null = cameraLayout
    ? focusFrame({ placement: settings.cameraPlacement, fontSize: phone ? Math.min(settings.fontSize, 26) : settings.fontSize, lines: settings.focusLines, columnWidth: settings.columnWidth, phone, safeTop }, win.w, win.h)
    : null;
  const language = resolveLanguage(settings.language, script?.source ?? "");
  // Devanagari and Gurmukhi vowel signs sit above and below the line, so they need more room.
  const indicText = !!script && ["hi", "pa"].includes(detectScriptLanguage(script.source));
  const lineHeight = settings.fontSize * (indicText ? 1.7 : 1.45);
  const readingOffset = frame || pip ? Math.round(lineHeight * 0.15) : Math.round(settings.readingLine * win.h);
  const readingOffsetRef = useRef(readingOffset);
  readingOffsetRef.current = readingOffset;

  // Measure layout after render and on resize / font changes.
  const remeasure = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;
    layoutRef.current.measure(content);
    highlighterRef.current.attach(content);
    // The text may have just moved between the tab and the floating window: re-apply the live highlight.
    const h = engineRef.current?.state;
    if (h) highlighterRef.current.update(h.currentWord, getSettings().stumbleAssist ? h.hardWord : null);
    engineRef.current?.setViewport(viewport.getBoundingClientRect());
    engineRef.current?.setReadingOffset(readingOffsetRef.current);
  }, []);

  useEffect(() => {
    if (!script) return;
    remeasure();
    const ro = new ResizeObserver(() => remeasure());
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [script, settings.fontSize, settings.lineWidth, settings.layout, settings.focusLines, settings.columnWidth, settings.cameraPlacement, win, pip, remeasure]);

  // The floating window has its own size and resize events.
  useEffect(() => {
    if (!pip) return;
    const t = window.setTimeout(remeasure, 30);
    pip.addEventListener("resize", remeasure);
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    pip.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      pip.removeEventListener("resize", remeasure);
      pip.removeEventListener("keydown", onKey);
    };
  }, [pip, remeasure]);

  // Apply highlights from the HUD.
  useEffect(() => {
    if (hud) highlighterRef.current.update(hud.currentWord, settings.stumbleAssist ? hud.hardWord : null);
  }, [hud?.currentWord, hud?.hardWord, settings.stumbleAssist]); // eslint-disable-line react-hooks/exhaustive-deps

  const teardown = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    visionVideoRef.current?.remove();
    visionVideoRef.current = null;
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

  const setBrightness = (v: number) => {
    const b = Math.max(0.2, Math.min(1, +v.toFixed(2)));
    updateSettings({ textBrightness: b });
    adaptiveRef.current?.setBase(b);
  };

  /** (Re)start speech recognition hosted in `host`, so it keeps running when our tab is in the background. */
  const startSpeech = async (engine: PrompterEngine, stream: MediaStream, host: Window) => {
    if (!script) return;
    const s = getSettings();
    if (s.speechProvider === "none" || s.scrollMode !== "voice") return;
    speechRef.current?.stop();
    const keyterms = [...new Set(script.words.filter((w) => w.difficulty >= 0.5).map((w) => w.display.replace(/[^\p{L}\p{N}'-]/gu, "")))].filter(Boolean);
    const provider = createSpeechProvider(s.speechProvider, { language: resolveLanguage(s.language, script.source), keyterms, apiUrl: s.apiUrl, host });
    if (!provider) return;
    provider.onResult = (r) => engine.handleSpeech(r);
    provider.onStatus = (st, detail) => engine.handleSpeechStatus(st, detail);
    speechRef.current = provider;
    await provider.start(stream);
  };

  /** Move the running session into a floating always-on-top window (or back). */
  const attachFloating = (w: Window) => {
    setPip(w);
    const engine = engineRef.current;
    engine?.setHost(w);
    const v = visionVideoRef.current;
    if (v) {
      w.document.body.append(v);
      void v.play().catch(() => undefined);
    }
    if (engine && streamRef.current && speechRef.current) void startSpeech(engine, streamRef.current, w);
    w.addEventListener(
      "pagehide",
      () => {
        setPip(null);
        const e = engineRef.current;
        if (!e) return;
        e.setHost(window);
        if (visionVideoRef.current) {
          document.body.append(visionVideoRef.current);
          void visionVideoRef.current.play().catch(() => undefined);
        }
        if (streamRef.current && speechRef.current) void startSpeech(e, streamRef.current, window);
      },
      { once: true },
    );
  };

  const float = async () => {
    try {
      const s = getSettings();
      const f = focusFrame({ placement: s.cameraPlacement, fontSize: isPhone() ? Math.min(s.fontSize, 26) : s.fontSize, lines: s.focusLines, columnWidth: s.columnWidth, phone: isPhone(), safeTop: safeAreaTop() });
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      attachFloating(await openFloatingWindow({ width: f.width, height: f.height + 34 }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const start = async (floating = false) => {
    if (!script || !stored) return;
    setError("");
    const s = getSettings();
    // Both need the click's user activation, so they come first.
    let floatWin: Window | null = null;
    if (floating) {
      try {
        const f = focusFrame({ placement: s.cameraPlacement, fontSize: isPhone() ? Math.min(s.fontSize, 26) : s.fontSize, lines: s.focusLines, columnWidth: s.columnWidth, phone: isPhone(), safeTop: safeAreaTop() });
        floatWin = await openFloatingWindow({ width: f.width, height: f.height + 34 });
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    } else if (s.layout === "camera") {
      // Fullscreen makes the camera position map exactly onto the window.
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    const needVideo = s.showCamera || s.pauseOnLookAway || s.gestureControl || !!s.gazeModel || record;
    let stream: MediaStream | null = null;
    try {
      stream = await openMedia({ video: needVideo, audio: s.speechProvider !== "none" || record, cameraId: s.cameraId, micId: s.micId });
    } catch (e) {
      setError((e as Error).message);
      if (s.speechProvider !== "none") return;
    }
    streamRef.current = stream;

    adaptiveRef.current = s.autoBrightness ? new AdaptiveBrightness({ base: s.textBrightness, ceiling: s.reflectionCheck?.level ?? 1 }) : null;
    const engine = new PrompterEngine({ script, scriptId: stored.id, scriptTitle: stored.title, settings: s, layout: layoutRef.current, research });
    engineRef.current = engine;
    engine.subscribe(setHud);
    engine.onScroll((px) => {
      if (contentRef.current) contentRef.current.style.transform = `translate3d(0, ${-px}px, 0)`;
    });
    remeasure();

    // Background: trained stumble model if one is deployed.
    void OnnxStumblePredictor.load().then((p) => p && engine.setPredictor(p, p.thresholds));

    // Countdown gives the speaker a beat to look at the text (skipped when floating: you're switching tabs anyway).
    if (!floatWin) {
      setPhase("countdown");
      for (let i = 3; i > 0; i--) {
        setCount(i);
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    setPhase("running");
    engine.start(stream);

    if (stream && stream.getVideoTracks().length) {
      // Vision runs on its own hidden video element so it can move into the floating window with the text.
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0";
      v.srcObject = stream;
      document.body.append(v);
      visionVideoRef.current = v;
      await v.play().catch(() => undefined);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      void startVision(engine, v);
    }

    if (stream) await startSpeech(engine, stream, floatWin ?? window);
    if (floatWin) attachFloating(floatWin);
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
      const ambientMeter = new AmbientMeter();
      const glareMeter = new EyeGlareMeter();
      let frameNo = 0;
      let lastInfo = 0;
      vision.onFrame = (f) => {
        engine.handleVision(f);
        const adaptive = adaptiveRef.current;
        if (adaptive) {
          // Room light every few frames; eye glare only while a probe is running.
          const now = performance.now();
          const lm = f.face?.landmarks ?? null;
          const ambient = frameNo++ % 3 === 0 ? ambientMeter.measure(video, lm) : null;
          const glare = lm && !f.face!.features.blink && adaptive.wantsGlare(now) ? glareMeter.measure(video, lm) : null;
          adaptive.update(now, ambient, glare);
          const snap = adaptive.snapshot();
          const tone = snap.warm ? "warm" : getSettings().textTone;
          for (const el of [rootRef.current, pipRootRef.current]) if (el) applyTextColors(el, adaptive.displayLevel(now), tone, snap.weight);
          if (now - lastInfo > 1000) {
            lastInfo = now;
            setAutoInfo(`auto ${Math.round(snap.level * 100)}%${snap.lastProbe?.visible ? " · glare reduced" : ""}`);
          }
        }
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
      if (record && visionVideoRef.current?.srcObject) {
        // Record the raw camera when processing is unavailable.
        const c = document.createElement("canvas");
        const v = visionVideoRef.current;
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
    closeFloatingWindow();
    setPip(null);
    teardown();
    const refined = engine.refinedGazeModel;
    if (refined) updateSettings({ gazeModel: refined.model });
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    const rec = engine.stop();
    rec.autoStumbles = detectStumbles(rec).map(({ t, kind, token }) => ({ t, kind, token }));
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
    keyHandlerRef.current = onKey;
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
  }, [script, pip]);

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
        <Link to="/app">Back to scripts</Link>
      </main>
    );
  }

  const running = phase === "running";
  // Recording in this tab: show yourself behind the text, like a mirror (dimmed so it doesn't glare).
  const backdrop = running && !pip && record && settings.cameraBehindText;
  const banner = !hud || !running
    ? null
    : error
      ? error
      : hud.paused
      ? "Paused · press Space or show an open palm to resume"
      : hud.pauseReason === "look-away"
        ? "Paused while you look away"
        : hud.speechStatus === "error" || hud.speechStatus === "unsupported"
          ? hud.speechDetail ?? "Speech recognition unavailable"
          : hud.offScript
            ? "Off script · keep going, I'll find you when you're back"
            : null;

  const colors = {
    "--ps-text": textColor(settings.textBrightness, settings.textTone),
    "--ps-spoken": textColor(settings.textBrightness, settings.textTone, 0.42),
    // Hard words get a saturated orange instead of a bright background: visible to you, not to the lens.
    "--ps-hard": `rgb(${[255, 150, 60].map((c) => Math.round(c * Math.max(0.3, settings.textBrightness))).join(", ")})`,
  } as React.CSSProperties;

  // In the floating window the text fills the window (you size and place it under the camera yourself).
  const textWindowStyle: React.CSSProperties | undefined = pip
    ? { left: 0, top: 0, right: 0, bottom: 30 }
    : frame
      ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height, right: "auto", bottom: "auto" }
      : undefined;
  const compact = !!(frame || pip);
  const textWindow = (
    <>
    {frame?.phone && !pip && <div className="phone-notch" aria-hidden style={{ height: frame.top + frame.height + 14 }} />}
    <div className="viewport" ref={viewportRef} data-testid="text-window" style={textWindowStyle}>
      <div
        className="content"
        ref={contentRef}
        lang={htmlLang(language)}
        style={{
          fontSize: frame?.phone ? Math.min(settings.fontSize, 26) : settings.fontSize,
          lineHeight: indicText ? 1.7 : undefined,
          maxWidth: compact ? "none" : `${settings.lineWidth}ch`,
          paddingTop: readingOffset,
          paddingLeft: compact ? lineHeight * 0.3 : undefined,
          paddingRight: compact ? lineHeight * 0.3 : undefined,
        }}
      >
        {script && <ScriptText script={script} onWordClick={(i) => engineRef.current?.seekWord(i)} />}
      </div>
      {!compact && <div className="reading-line" style={{ top: readingOffset + settings.fontSize * 0.72 }} />}
    </div>
    </>
  );

  const floatingWindow =
    pip &&
    createPortal(
      <div ref={pipRootRef} className={`prompter camera-layout pip-root${settings.mirror ? " mirrored" : ""}`} style={colors} data-testid="floating-prompter">
        {textWindow}
        <div className="pip-bar">
          <button onClick={() => engineRef.current?.command("toggle_pause")} title="Pause / resume (Space)">
            {hud?.paused ? "▶" : "❚❚"}
          </button>
          <button onClick={() => engineRef.current?.command("rewind_sentence")} title="Rewind sentence (R)">
            ↺
          </button>
          <button onClick={() => setBrightness(getSettings().textBrightness - 0.1)} title="Dimmer">
            ☾
          </button>
          <button onClick={() => setBrightness(getSettings().textBrightness + 0.1)} title="Brighter">
            ☀
          </button>
          <button onClick={() => updateSettings({ fontSize: Math.max(18, getSettings().fontSize - 4) })} title="Smaller text">
            A−
          </button>
          <button onClick={() => updateSettings({ fontSize: Math.min(120, getSettings().fontSize + 4) })} title="Larger text">
            A+
          </button>
          <span className="pip-status" role="status">
            {banner ?? (hud?.speaking ? "listening…" : autoInfo)}
          </span>
          <button onClick={() => pip.close()} title="Bring the text back into the JOTR tab">
            ⤺
          </button>
          <button onClick={() => void stop()} title="Finish (Esc)" data-testid="pip-stop">
            ■
          </button>
        </div>
      </div>,
      pip.document.body,
    );

  return (
    <div
      ref={rootRef}
      className={`prompter${settings.mirror ? " mirrored" : ""}${cameraLayout ? " camera-layout" : ""}${backdrop ? " with-backdrop" : ""}${frame?.phone ? " phone" : ""}`}
      onMouseMove={poke}
      data-testid="prompter"
      data-predictor={hud?.predictor}
      data-floating={pip ? "true" : undefined}
      style={colors}
    >
      {pip ? floatingWindow : textWindow}
      {pip && running && (
        <div className="overlay">
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Floating over your other tabs</h2>
            <p>
              Switch to Meet, your interview or any other tab or app. The text stays on top. <strong>Drag the floating window right under your camera</strong>{" "}
              once; Chrome remembers where you put it.
            </p>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              If you share your <em>entire screen</em>, the floating window is visible in the share. Share a tab or window instead.
            </p>
            <div className="row">
              <button className="btn" onClick={() => engineRef.current?.command("toggle_pause")}>
                {hud?.paused ? "▶ Resume" : "❚❚ Pause"}
              </button>
              <button className="btn" onClick={() => pip.close()}>
                Bring text back here
              </button>
              <button className="btn primary" onClick={() => void stop()}>
                ■ Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {settings.stumbleAssist && running && hud && (
        <div className="risk" title={`Stumble risk (${hud.predictor})`}>
          <div style={{ height: `${Math.round(hud.risk * 100)}%` }} />
        </div>
      )}
      {banner && (
        <div className="banner" role="status" style={frame ? { top: "auto", bottom: 70 } : undefined}>
          {banner}
        </div>
      )}
      {hud?.gazePoint && running && (
        <div className="gaze-dot" style={{ left: `${hud.gazePoint.x * 100}%`, top: `${hud.gazePoint.y * 100}%` }} aria-hidden />
      )}

      {/* A bright camera preview reflects in eyes and glasses, so camera layout never shows it. */}
      <div className={`cam${backdrop ? " backdrop" : ""}${settings.mirrorVideo ? "" : " unmirrored"}`} style={{ display: backdrop || (settings.showCamera && !cameraLayout && running) ? "block" : "none" }} aria-hidden={backdrop}>
        <div ref={camSlotRef} />
        <video ref={videoRef} muted playsInline style={{ display: processorRef.current && (record || settings.eyeContact) ? "none" : "block" }} />
      </div>

      <div className={`toolbar${running && !toolbarVisible ? " hidden" : ""}`}>
        <Link to="/app" className="btn small" onClick={() => teardown()}>
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
            {!pip && (
              <button
                className="btn small"
                onClick={() => {
                  const why = floatingUnavailableReason();
                  if (why) setError(why);
                  else void float();
                }}
                title="Keep the text on top of every tab and app"
              >
                ⧉ Float over other tabs
              </button>
            )}
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
          Mirror text
        </button>
        {(backdrop || (settings.showCamera && !cameraLayout)) && (
          <button className="btn small" onClick={() => updateSettings({ mirrorVideo: !settings.mirrorVideo })} aria-pressed={settings.mirrorVideo}>
            Mirror video
          </button>
        )}
        <button
          className="btn small"
          onClick={() => updateSettings({ layout: cameraLayout ? "full" : "camera" })}
          title="Camera layout keeps the text right under your webcam"
        >
          {cameraLayout ? "Full screen text" : "Text under camera"}
        </button>
        {cameraLayout && (
          <>
            <button className="btn small" onClick={() => updateSettings({ focusLines: Math.max(1, settings.focusLines - 1) })} aria-label="Fewer lines">
              − line
            </button>
            <button className="btn small" onClick={() => updateSettings({ focusLines: Math.min(8, settings.focusLines + 1) })} aria-label="More lines">
              + line
            </button>
            <button className="btn small" onClick={() => setBrightness(settings.textBrightness - 0.1)} aria-label="Dimmer text">
              ☾
            </button>
            <button className="btn small" onClick={() => setBrightness(settings.textBrightness + 0.1)} aria-label="Brighter text">
              ☀
            </button>
          </>
        )}
        <div className="grow" />
        {running && hud && (
          <>
            <StatusChip ok={hud.speechStatus === "listening"} warn={hud.speechStatus === "starting"} label={hud.speaking ? "speaking" : `mic: ${hud.speechStatus}`} />
            <StatusChip ok={visionStatus === "on" && hud.faceFound} warn={visionStatus === "loading"} label={visionStatus === "on" ? (hud.faceFound ? "face" : "no face") : `vision: ${visionStatus}`} />
            {settings.gestureControl && hud.gestureProgress > 0 && <GestureRing progress={hud.gestureProgress} label={hud.gesture} />}
            {recorderRef.current?.recording && <StatusChip ok={false} warn={false} bad label="REC" />}
            {autoInfo && <span className="chip" title="Text brightness adapts to room light and reflections">☀ {autoInfo}</span>}
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
            {record && (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={settings.cameraBehindText} onChange={(e) => updateSettings({ cameraBehindText: e.target.checked })} />
                <span>Show me behind the text while recording (dimmed, so it doesn't reflect in glasses)</span>
              </label>
            )}
            {settings.researchConsent && (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />
                <span>Save as a research session (full-rate gaze and features, for model training)</span>
              </label>
            )}
            {error && <div className="alert error">{error}</div>}
            <div className="start-modes" role="group" aria-label="How to read">
              <button className="start-mode" disabled={!script} onClick={() => void start()} data-testid="start">
                <span className="start-mode-icon" aria-hidden>
                  ▶
                </span>
                <b>Start here</b>
                <span>Full screen in this tab.{record && settings.cameraBehindText ? " Your camera shows behind the text." : " Best for recording a video."}</span>
              </button>
{phone ? (
                script && <PhoneFloat text={script.words.map((w) => w.display).join(" ")} />
              ) : (
              <button
                className={`start-mode${floatingSupported() ? "" : " unavailable"}`}
                disabled={!script}
                onClick={() => {
                  const why = floatingUnavailableReason();
                  if (why) setError(why);
                  else void start(true);
                }}
                data-testid="start-floating"
                title="An always-on-top window that works over Meet, interview sites and any other tab or app"
              >
                <span className="start-mode-icon" aria-hidden>
                  ⧉
                </span>
                <b>Float over any tab</b>
                <span>{floatingSupported() ? "An always-on-top window for Meet, interviews and other apps." : "Not available in this browser. Click to see why."}</span>
              </button>
              )}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn small ghost" to={`/edit/${id}`}>
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
        <div className="banner" style={frame ? { top: "auto", bottom: 110 } : { top: 60 }} role="alert">
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
        <circle cx="18" cy="18" r="14" fill="none" stroke="#ff8a3d" strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 18 18)" />
      </svg>
      {label.replace("_", " ")}
    </span>
  );
}

/** Set the live text colour variables (used by adaptive brightness, which updates every camera frame). */
function applyTextColors(el: HTMLElement, level: number, tone: "warm" | "neutral", weight: number): void {
  el.style.setProperty("--ps-text", textColor(level, tone));
  el.style.setProperty("--ps-spoken", textColor(level, tone, 0.42));
  el.style.setProperty("--ps-hard", `rgb(${[255, 150, 60].map((c) => Math.round(c * Math.max(0.3, level))).join(", ")})`);
  el.style.setProperty("--ps-weight", String(weight));
}
