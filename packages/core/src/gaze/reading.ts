import type { GazeSample } from "../fusion/timeline.js";

/**
 * Fixation/saccade segmentation and the reading-vs-not classifier behind
 * saccade-aware eye contact (module 2). Reading has a distinctive rhythm:
 * short progressive (rightward for LTR scripts) saccades along a line, a
 * fixation of ~150–300 ms each, and an occasional long return sweep to the
 * start of the next line. Glances, thinking pauses and looking at the
 * audience do not.
 */

export interface Fixation {
  start: number;
  end: number;
  x: number;
  y: number;
}

export interface Saccade {
  t: number;
  dx: number;
  dy: number;
}

export interface GazeEvents {
  fixations: Fixation[];
  saccades: Saccade[];
}

/**
 * Velocity-threshold (I-VT) segmentation. Velocity is in normalised screen
 * widths per second; webcam gaze is noisy so the threshold is high and short
 * fixations are merged.
 */
export function segmentGaze(samples: GazeSample[], velocityThreshold = 1.2, minFixationMs = 80): GazeEvents {
  const fixations: Fixation[] = [];
  const saccades: Saccade[] = [];
  let cur: { start: number; end: number; sx: number; sy: number; n: number } | null = null;
  let prev: GazeSample | null = null;

  const close = () => {
    if (cur && cur.end - cur.start >= minFixationMs) {
      const fx = { start: cur.start, end: cur.end, x: cur.sx / cur.n, y: cur.sy / cur.n };
      const last = fixations[fixations.length - 1];
      if (last) saccades.push({ t: fx.start, dx: fx.x - last.x, dy: fx.y - last.y });
      fixations.push(fx);
    }
    cur = null;
  };

  for (const s of samples) {
    if (!s.valid || s.blink || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      prev = null;
      continue;
    }
    if (prev) {
      const dt = Math.max(1, s.t - prev.t) / 1000;
      const v = Math.hypot(s.x - prev.x, s.y - prev.y) / dt;
      if (v > velocityThreshold) close();
    }
    if (!cur) cur = { start: s.t, end: s.t, sx: 0, sy: 0, n: 0 };
    cur.end = s.t;
    cur.sx += s.x;
    cur.sy += s.y;
    cur.n++;
    prev = s;
  }
  close();
  return { fixations, saccades };
}

export interface ReadingFeatures {
  /** Fraction of saccades that move forward along a line. */
  progressiveRatio: number;
  /** Return sweeps (long backward + slightly down) per second. */
  returnSweepRate: number;
  /** Mean fixation duration in ms. */
  meanFixation: number;
  /** Vertical spread of fixations relative to horizontal spread. */
  verticalSpread: number;
  /** Fraction of time with gaze on the prompter region. */
  onPrompter: number;
  /** Absolute head yaw in degrees (large yaw = looking off to the side). */
  headYaw: number;
}

export interface PrompterRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function readingFeatures(
  samples: GazeSample[],
  region: PrompterRegion,
  direction: "ltr" | "rtl" = "ltr",
): ReadingFeatures {
  const { fixations, saccades } = segmentGaze(samples);
  const sign = direction === "ltr" ? 1 : -1;
  let progressive = 0;
  let sweeps = 0;
  for (const s of saccades) {
    const fwd = s.dx * sign;
    if (fwd > 0.005 && fwd < 0.25 && Math.abs(s.dy) < 0.06) progressive++;
    else if (fwd < -0.15 && s.dy > -0.02 && s.dy < 0.15) sweeps++;
  }
  const duration = samples.length > 1 ? (samples[samples.length - 1]!.t - samples[0]!.t) / 1000 : 0;
  const xs = fixations.map((f) => f.x);
  const ys = fixations.map((f) => f.y);
  const spread = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
  const valid = samples.filter((s) => s.valid && Number.isFinite(s.x));
  const on = valid.filter((s) => s.x >= region.x0 && s.x <= region.x1 && s.y >= region.y0 && s.y <= region.y1).length;
  return {
    progressiveRatio: saccades.length ? progressive / saccades.length : 0,
    returnSweepRate: duration > 0 ? sweeps / duration : 0,
    meanFixation: fixations.length ? fixations.reduce((a, f) => a + (f.end - f.start), 0) / fixations.length : 0,
    verticalSpread: spread(ys) / (spread(xs) + 0.02),
    onPrompter: valid.length ? on / valid.length : 0,
    headYaw: valid.length ? valid.reduce((a, s) => a + Math.abs(s.yaw), 0) / valid.length : 90,
  };
}

/** Weights for the logistic reading classifier. Replaced by a trained model when one is available. */
export const READING_WEIGHTS = {
  bias: -2.2,
  progressiveRatio: 3.0,
  returnSweepRate: 0.8,
  fixationInRange: 1.0,
  verticalSpread: -1.2,
  onPrompter: 2.5,
  headYaw: -0.08,
};

export function readingProbability(f: ReadingFeatures, w = READING_WEIGHTS): number {
  const fixationInRange = f.meanFixation >= 120 && f.meanFixation <= 450 ? 1 : 0;
  const z =
    w.bias +
    w.progressiveRatio * f.progressiveRatio +
    w.returnSweepRate * Math.min(2, f.returnSweepRate) +
    w.fixationInRange * fixationInRange +
    w.verticalSpread * Math.min(3, f.verticalSpread) +
    w.onPrompter * f.onPrompter +
    w.headYaw * f.headYaw;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Turns per-frame reading probabilities into a smooth 0..1 blend weight for
 * gaze redirection: hysteresis avoids flicker, and the ramp avoids visible
 * "snapping" of the eyes when correction switches on or off.
 */
export class ReadingGate {
  private active = false;
  weight = 0;

  constructor(
    private readonly onThreshold = 0.65,
    private readonly offThreshold = 0.4,
    private readonly rampMs = 180,
  ) {}

  update(probability: number, dtMs: number, blink = false): number {
    if (probability >= this.onThreshold) this.active = true;
    else if (probability <= this.offThreshold) this.active = false;
    const goal = this.active ? 1 : 0;
    // Blinks hide the transition, so ramp much faster during them.
    const step = (dtMs / this.rampMs) * (blink ? 4 : 1);
    this.weight += Math.max(-step, Math.min(step, goal - this.weight));
    return this.weight;
  }

  get isReading(): boolean {
    return this.active;
  }
}
