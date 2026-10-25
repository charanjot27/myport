import {
  classifyHand,
  downsample,
  FusionTimeline,
  GestureDebouncer,
  handMotionEnergy,
  HeuristicStumblePredictor,
  OneEuroFilter,
  fitGazeModel,
  predictGaze,
  ScriptAligner,
  ScrollController,
  StumbleFeatureExtractor,
  StumbleMonitor,
  STUMBLE_SPEC,
  wordAtToken,
  type CalibrationSample,
  type FaceSample,
  type GazeModel,
  type GazeSample,
  type ParsedScript,
  type Point3,
  type PrompterCommand,
  type SessionRecord,
} from "@promptsense/core";
import type { Settings } from "../lib/settings";
import type { SpeechResult, SpeechStatus } from "../speech/types";
import { VoiceActivity } from "../speech/vad";
import type { VisionFrame } from "../vision/visionEngine";
import type { ScriptLayout } from "./layout";

/**
 * The live prompting session. Plain TypeScript (no React) so the hot path —
 * speech alignment, scroll physics, per-frame perception — never waits on a
 * render. The view subscribes to a throttled HUD snapshot.
 */

export interface HudState {
  running: boolean;
  paused: boolean;
  pauseReason: "user" | "look-away" | null;
  speechStatus: SpeechStatus;
  speechDetail?: string;
  speaking: boolean;
  currentWord: number;
  confidence: number;
  offScript: boolean;
  risk: number;
  warning: boolean;
  hardWord: number | null;
  lookingAway: boolean;
  faceFound: boolean;
  gazeWord: number | null;
  gazePoint: { x: number; y: number } | null;
  gesture: string;
  gestureProgress: number;
  lastCommand: PrompterCommand | null;
  inferenceMs: number;
  elapsedMs: number;
  finished: boolean;
  predictor: string;
  lastTranscript: string;
}

export interface EngineOptions {
  script: ParsedScript;
  scriptId: string;
  scriptTitle: string;
  settings: Settings;
  layout: ScriptLayout;
  research: boolean;
}

const LOOK_AWAY_MS = 700;

export class PrompterEngine {
  readonly timeline = new FusionTimeline();
  readonly aligner: ScriptAligner;
  readonly scroll: ScrollController;
  private readonly features: StumbleFeatureExtractor;
  readonly stumble = new StumbleMonitor(new HeuristicStumblePredictor());
  private readonly gestures = new GestureDebouncer();
  private readonly vad = new VoiceActivity();
  private readonly fx = new OneEuroFilter(0.8, 0.03);
  private readonly fy = new OneEuroFilter(0.8, 0.03);
  private hud: HudState;
  private listeners = new Set<(h: HudState) => void>();
  private scrollListeners = new Set<(px: number) => void>();
  private raf = 0;
  private featureTimer = 0;
  private lastTick = 0;
  private startedAt = 0;
  private awaySince: number | null = null;
  private prevHand: Point3[] | null = null;
  private prevHandT = 0;
  private lastHudEmit = 0;
  private viewport: { rect: DOMRect; height: number } | null = null;
  private stopped = false;
  /** Pixels from the top of the viewport to the reading line; set by the view's layout. */
  private readingOffset: number | null = null;
  private gazeModel: GazeModel | null;
  private implicit: CalibrationSample[] = [];
  private lastImplicitT = 0;
  private lastRefitT = 0;
  private refined = false;

  // Session record buffers (derived signals only, never media).
  private transcript: SessionRecord["transcript"] = [];
  private alignment: SessionRecord["alignment"] = [];
  private gazeLog: GazeSample[] = [];
  private faceLog: FaceSample[] = [];
  private riskLog: SessionRecord["stumbleRisk"] = [];
  private featureLog: NonNullable<SessionRecord["features"]> = [];
  private handLog: NonNullable<SessionRecord["handMotion"]> = [];

  constructor(private readonly opts: EngineOptions) {
    this.aligner = new ScriptAligner(opts.script);
    this.gazeModel = opts.settings.gazeModel;
    this.features = new StumbleFeatureExtractor(opts.script);
    this.scroll = new ScrollController({ fixedSpeed: opts.settings.fixedSpeed });
    this.scroll.mode = opts.settings.scrollMode;
    this.hud = {
      running: false,
      paused: false,
      pauseReason: null,
      speechStatus: "idle",
      speaking: false,
      currentWord: 0,
      confidence: 0,
      offScript: false,
      risk: 0,
      warning: false,
      hardWord: null,
      lookingAway: false,
      faceFound: false,
      gazeWord: null,
      gazePoint: null,
      gesture: "none",
      gestureProgress: 0,
      lastCommand: null,
      inferenceMs: 0,
      elapsedMs: 0,
      finished: false,
      predictor: this.stumble.predictorName,
      lastTranscript: "",
    };
  }

  get settings(): Settings {
    return this.opts.settings;
  }

  subscribe(fn: (h: HudState) => void): () => void {
    this.listeners.add(fn);
    fn(this.hud);
    return () => this.listeners.delete(fn);
  }

  onScroll(fn: (px: number) => void): () => void {
    this.scrollListeners.add(fn);
    return () => this.scrollListeners.delete(fn);
  }

  setViewport(rect: DOMRect): void {
    this.viewport = { rect, height: rect.height };
    this.scroll.setBounds(Math.max(0, this.opts.layout.contentHeight - rect.height * 0.4));
    this.retarget();
  }

  setPredictor(p: ConstructorParameters<typeof StumbleMonitor>[0], thresholds?: { on: number; off: number }): void {
    this.stumble.setPredictor(p, thresholds);
    this.patch({ predictor: p.name }, true);
  }

  /**
   * The window that drives the loops. When the prompter floats in a
   * Picture-in-Picture window, our own tab is in the background where the
   * browser throttles animation frames and timers, so the visible PiP window
   * schedules the work instead.
   */
  private host: Window = window;

  setHost(win: Window): void {
    if (win === this.host) return;
    const running = this.hud.running && !this.stopped;
    if (running) this.stopLoops();
    this.host = win;
    if (running) this.startLoops();
  }

  /** Gaze calibration maps to our own tab's coordinates, so gaze-to-word only works when the text is shown there. */
  private get gazeOnText(): boolean {
    return this.host === window;
  }

  start(stream: MediaStream | null): void {
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
    if (stream?.getAudioTracks().length) this.vad.start(stream);
    this.patch({ running: true }, true);
    this.timeline.emit("start", 0);
    this.startLoops();
  }

  private startLoops(): void {
    const host = this.host;
    const tick = () => {
      if (this.stopped || host !== this.host) return;
      // performance.now() of our own window: every timestamp shares one clock, whichever window schedules.
      this.tick(performance.now());
      this.raf = host.requestAnimationFrame(tick);
    };
    this.raf = host.requestAnimationFrame(tick);
    this.featureTimer = host.setInterval(() => void this.featureFrame(), 1000 / STUMBLE_SPEC.frameHz);
  }

  private stopLoops(): void {
    this.host.cancelAnimationFrame(this.raf);
    this.host.clearInterval(this.featureTimer);
  }

  stop(): SessionRecord {
    this.stopped = true;
    this.stopLoops();
    this.vad.stop();
    this.patch({ running: false }, true);
    return this.buildRecord();
  }

  private now(): number {
    return performance.now() - this.startedAt;
  }

  // ---------------------------------------------------------------- speech

  handleSpeech(r: SpeechResult): void {
    const t = r.t - this.startedAt;
    this.transcript.push({ t, text: r.text, isFinal: r.isFinal });
    if (this.scroll.mode !== "voice" || this.hud.paused) {
      this.patch({ lastTranscript: r.text });
      return;
    }
    const u = this.aligner.update(r.text, r.isFinal, t);
    this.alignment.push({ t, position: u.position, confidence: u.confidence, offScript: u.offScript, jumped: u.jumped });
    this.timeline.speech.push({ t, position: u.position, confidence: u.confidence, offScript: u.offScript, speaking: true });
    const currentWord = wordAtToken(this.opts.script, Math.max(0, u.position - 1));
    this.patch({
      currentWord,
      confidence: u.confidence,
      offScript: u.offScript,
      finished: u.finished,
      lastTranscript: r.text,
    });
    this.retarget();
  }

  handleSpeechStatus(s: SpeechStatus, detail?: string): void {
    this.patch({ speechStatus: s, speechDetail: detail }, true);
  }

  // ---------------------------------------------------------------- vision

  handleVision(f: VisionFrame): void {
    const t = f.t - this.startedAt;
    const face = f.face;
    let lookingAway = false;
    if (!face || Math.abs(face.features.pose.yaw) > 28 || Math.abs(face.features.pose.pitch) > 25) {
      this.awaySince ??= t;
      lookingAway = t - this.awaySince > LOOK_AWAY_MS;
    } else {
      this.awaySince = null;
    }

    let gazeWord: number | null = null;
    let gazePoint: { x: number; y: number } | null = null;
    if (face) {
      const model = this.gazeModel;
      let gx = Number.NaN;
      let gy = Number.NaN;
      if (model && !face.features.blink) {
        const p = predictGaze(model, face.features.vector);
        if (Number.isFinite(p.x)) {
          gx = this.fx.filter(p.x, f.t);
          gy = this.fy.filter(p.y, f.t);
          gazePoint = { x: gx, y: gy };
          if (this.viewport && this.gazeOnText) {
            gazeWord = this.opts.layout.wordAtPoint(gx * window.innerWidth, gy * window.innerHeight, this.viewport.rect, this.scroll.position, this.opts.settings.mirror);
          }
          if (this.gazeOnText) this.refineCalibration(t, face.features.vector, p);
        }
      }
      const g: GazeSample = { t, x: gx, y: gy, valid: !face.features.blink, blink: face.features.blink, yaw: face.features.pose.yaw, pitch: face.features.pose.pitch };
      this.timeline.gaze.push(g);
      this.gazeLog.push(g);
      const fs: FaceSample = { t, cx: face.features.cx, cy: face.features.cy, scale: face.features.scale, roll: face.features.pose.roll, mouthOpen: face.features.mouthOpen, ...(f.skin ? { skin: f.skin } : {}) };
      this.timeline.face.push(fs);
      this.faceLog.push(fs);
    } else {
      const g: GazeSample = { t, x: Number.NaN, y: Number.NaN, valid: false, blink: false, yaw: 0, pitch: 0 };
      this.timeline.gaze.push(g);
      this.gazeLog.push(g);
    }

    // Gesture control.
    let lastCommand = this.hud.lastCommand;
    let gesture = this.hud.gesture;
    let gestureProgress = 0;
    if (this.opts.settings.gestureControl) {
      const g = f.hand ? classifyHand(f.hand) : "none";
      const cmd = this.gestures.update(g, t);
      gesture = g;
      gestureProgress = this.gestures.progress(t);
      if (cmd) {
        this.command(cmd);
        lastCommand = cmd;
      }
      if (f.hand) {
        this.handLog.push({ t, energy: handMotionEnergy(this.prevHand, f.hand, t - this.prevHandT) });
        this.prevHand = f.hand;
        this.prevHandT = t;
      }
    }

    const wasAway = this.hud.lookingAway;
    if (this.opts.settings.pauseOnLookAway && lookingAway !== wasAway) {
      this.timeline.emit(lookingAway ? "look-away" : "look-back", t);
    }

    this.patch({
      faceFound: !!face,
      lookingAway,
      gazeWord,
      gazePoint,
      gesture,
      gestureProgress,
      lastCommand,
      inferenceMs: f.inferenceMs,
    });
  }

  // ---------------------------------------------------------------- control

  command(cmd: PrompterCommand): void {
    const t = this.now();
    this.timeline.emit("command", t, { cmd });
    const words = this.opts.script.words;
    const sections = this.opts.script.sections;
    const cur = this.hud.currentWord;
    switch (cmd) {
      case "toggle_pause":
        this.setPaused(!this.hud.paused);
        break;
      case "resume":
        this.setPaused(false);
        break;
      case "rewind_sentence": {
        const sentence = words[cur]?.sentence ?? 0;
        const target = words.find((w) => w.sentence === Math.max(0, sentence - (words[cur]?.sentenceStart ? 1 : 0)));
        if (target) this.seekWord(target.index);
        break;
      }
      case "next_section": {
        const s = words[cur]?.section ?? 0;
        const next = sections[s + 1];
        if (next) this.seekWord(next.wordStart);
        break;
      }
      case "previous_section": {
        const s = words[cur]?.section ?? 0;
        const start = sections[s]?.wordStart ?? 0;
        const target = cur - start > 3 ? start : sections[Math.max(0, s - 1)]?.wordStart ?? 0;
        this.seekWord(target);
        break;
      }
    }
  }

  setPaused(paused: boolean): void {
    this.timeline.emit(paused ? "pause" : "resume", this.now());
    this.patch({ paused, pauseReason: paused ? "user" : null }, true);
  }

  seekWord(wordIndex: number): void {
    const w = this.opts.script.words[wordIndex];
    if (!w) return;
    this.aligner.seek(w.tokenStart);
    this.timeline.emit("seek", this.now(), { word: wordIndex });
    this.patch({ currentWord: wordIndex, offScript: false }, true);
    this.retarget();
  }

  setMode(mode: Settings["scrollMode"]): void {
    this.scroll.mode = mode;
    if (mode === "fixed") this.scroll.target = this.scroll.position;
  }

  /** Manual scrolling (wheel, keys) in manual mode. */
  nudge(px: number): void {
    this.scroll.setTarget(this.scroll.target + px);
    if (this.scroll.mode !== "voice") this.scroll.position = this.scroll.target;
  }

  /** Distance from the top of the viewport to the reading line, in pixels. */
  setReadingOffset(px: number): void {
    this.readingOffset = px;
    this.retarget();
  }

  private get offset(): number {
    return this.readingOffset ?? (this.viewport?.height ?? 0) * this.opts.settings.readingLine;
  }

  /** The gaze model after in-session refinement, if it changed. */
  get refinedGazeModel(): { model: GazeModel; samples: CalibrationSample[] } | null {
    return this.refined && this.gazeModel ? { model: this.gazeModel, samples: this.implicit } : null;
  }

  /**
   * Implicit calibration: while the speaker is fluently reading on-script, their
   * eyes are on (or just ahead of) the word being spoken. Those moments become
   * extra calibration samples, and the model is refitted every few seconds, so
   * accuracy improves as you read and drift from posture changes is corrected.
   */
  private refineCalibration(t: number, features: number[], predicted: { x: number; y: number }): void {
    const h = this.hud;
    if (!this.viewport || !this.gazeModel || !h.speaking || h.offScript || h.paused || h.confidence < 0.7) return;
    if (t - this.lastImplicitT < 200) return;
    const layout = this.opts.layout;
    const w = Math.min(layout.tops.length - 1, h.currentWord + 1);
    if (w < 0) return;
    const rect = this.viewport.rect;
    let x = rect.left + (layout.lefts[w] ?? 0) + (layout.widths[w] ?? 0) / 2;
    if (this.opts.settings.mirror) x = rect.left + rect.width - (x - rect.left);
    const line = layout.lines[layout.lineOf[w] ?? -1];
    const y = rect.top + layout.wordTop(w) - this.scroll.position + (line ? (line.bottom - line.top) / 2 : 0);
    const target = { x: x / window.innerWidth, y: y / window.innerHeight };
    // Only trust moments where the current model already roughly agrees (within ~2 lines), so a glance away is never learnt.
    const lineH = this.opts.settings.fontSize * 1.45;
    if (Math.abs(predicted.y - target.y) * window.innerHeight > lineH * 2) return;
    this.lastImplicitT = t;
    this.implicit.push({ features, ...target });
    if (this.implicit.length > 300) this.implicit.shift();
    if (this.implicit.length >= 25 && t - this.lastRefitT > 8000) {
      this.lastRefitT = t;
      const explicit = this.opts.settings.calibrationSamples;
      try {
        const m = this.gazeModel;
        this.gazeModel = fitGazeModel([...explicit, ...this.implicit.slice(-150)], m.lambda, m.degree);
        this.refined = true;
        this.timeline.emit("gaze-refit", t, { implicit: this.implicit.length, error: this.gazeModel.trainError });
      } catch {
        // Keep the previous model.
      }
    }
  }

  private retarget(): void {
    if (!this.viewport || this.scroll.mode !== "voice") return;
    const top = this.opts.layout.wordTop(this.hud.currentWord);
    this.scroll.setTarget(Math.max(0, top - this.offset));
  }

  // ---------------------------------------------------------------- loop

  private tick(now: number): void {
    const dt = now - this.lastTick;
    this.lastTick = now;
    const speaking = this.vad.sample(now);
    const lookPause = this.opts.settings.pauseOnLookAway && this.hud.lookingAway && !speaking;
    const slowFactor = this.opts.settings.stumbleAssist ? this.stumble.slowFactor : 1;
    const px = this.scroll.step(dt, { paused: this.hud.paused || lookPause, slowFactor });
    this.scrollListeners.forEach((l) => l(px));
    // In fixed mode, the "current word" follows the reading line.
    if (this.scroll.mode !== "voice" && this.viewport) {
      const lineY = px + this.offset;
      const layout = this.opts.layout;
      let idx = this.hud.currentWord;
      while (idx + 1 < layout.tops.length && (layout.tops[idx + 1] ?? 0) <= lineY) idx++;
      while (idx > 0 && (layout.tops[idx] ?? 0) > lineY) idx--;
      if (idx !== this.hud.currentWord) this.patch({ currentWord: idx });
    }
    this.patch({
      speaking,
      elapsedMs: now - this.startedAt,
      pauseReason: this.hud.paused ? "user" : lookPause ? "look-away" : null,
    });
  }

  private async featureFrame(): Promise<void> {
    const t = this.now();
    const f = this.features.next({
      t,
      speechWord: this.hud.currentWord,
      gazeWord: this.hud.gazeWord,
      speaking: this.hud.speaking,
      alignConfidence: this.hud.confidence,
      offScript: this.hud.offScript,
    });
    if (this.opts.research) this.featureLog.push({ t, f: Array.from(f) });
    if (!this.opts.settings.stumbleAssist) return;
    const { risk, warning } = await this.stumble.push(f);
    this.riskLog.push({ t, risk, warning });
    let hardWord: number | null = null;
    if (warning) {
      const words = this.opts.script.words;
      let best = -1;
      for (let i = this.hud.currentWord + 1; i < Math.min(words.length, this.hud.currentWord + 6); i++) {
        if (words[i]!.difficulty > best) {
          best = words[i]!.difficulty;
          hardWord = i;
        }
      }
    }
    this.patch({ risk, warning, hardWord });
  }

  private patch(p: Partial<HudState>, force = false): void {
    let changed = false;
    for (const k of Object.keys(p) as Array<keyof HudState>) {
      if (this.hud[k] !== p[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.hud = { ...this.hud, ...p };
    const now = performance.now();
    // HUD re-renders at most ~15 times per second unless something important changed.
    if (force || now - this.lastHudEmit > 66 || "currentWord" in p || "warning" in p) {
      this.lastHudEmit = now;
      this.listeners.forEach((l) => l(this.hud));
    }
  }

  get state(): HudState {
    return this.hud;
  }

  private buildRecord(): SessionRecord {
    const durationMs = this.now();
    return {
      version: 1,
      id: crypto.randomUUID(),
      scriptId: this.opts.scriptId,
      scriptTitle: this.opts.scriptTitle,
      scriptSource: this.opts.script.source,
      startedAt: new Date(Date.now() - durationMs).toISOString(),
      durationMs,
      tokenTimings: this.aligner.tokenTimings(),
      transcript: this.transcript,
      alignment: this.alignment,
      gaze: this.opts.research ? this.gazeLog : downsample(this.gazeLog, 10),
      face: this.opts.research ? this.faceLog : downsample(this.faceLog, 10),
      stumbleRisk: this.riskLog,
      ...(this.opts.research ? { features: this.featureLog } : {}),
      ...(this.handLog.length ? { handMotion: downsample(this.handLog, 10) } : {}),
      events: this.timeline.events,
      meta: {
        predictor: this.stumble.predictorName,
        userAgent: navigator.userAgent,
        settings: { scrollMode: this.opts.settings.scrollMode, speech: this.opts.settings.speechProvider, calibrated: !!this.opts.settings.gazeModel },
      },
    };
  }
}
