import { FEATURE_COUNT, STUMBLE_SPEC } from "./features.js";

/**
 * Stumble predictors share one interface so the app can start with the
 * heuristic baseline and swap in the trained GRU (ONNX) without other changes.
 */
export interface StumblePredictor {
  readonly name: string;
  /** `window` is WINDOW frames of FEATURE_COUNT features, oldest first. Returns risk in 0..1. */
  predict(window: Float32Array[]): number | Promise<number>;
}

const idx = (name: (typeof STUMBLE_SPEC.features)[number]) => STUMBLE_SPEC.features.indexOf(name);
const I = {
  evs: idx("evs_words"),
  evsDelta: idx("evs_delta"),
  valid: idx("gaze_valid"),
  fixation: idx("fixation_s"),
  regression: idx("regression"),
  diffMax: idx("next_difficulty_max"),
  sinceAdvance: idx("since_advance_s"),
  speaking: idx("speaking"),
  breakAhead: idx("break_ahead"),
};

/**
 * Hand-built baseline from the psycholinguistics: the eye normally leads the
 * voice by 1–3 words. A collapsing span, a long fixation on an upcoming word, a
 * regression, or hard words ahead all raise the risk.
 */
export class HeuristicStumblePredictor implements StumblePredictor {
  readonly name = "heuristic-v1";

  predict(window: Float32Array[]): number {
    const f = window[window.length - 1];
    if (!f || f.length !== FEATURE_COUNT) return 0;
    if (!f[I.valid]) {
      // No gaze (uncalibrated or looking away): fall back to speech hesitation before hard words.
      const z = -3.4 + 2.6 * f[I.diffMax]! + 0.9 * Math.min(1.5, f[I.sinceAdvance]!) - 0.8 * f[I.breakAhead]!;
      return sigmoid(z);
    }
    const evsWords = f[I.evs]! * 10;
    const shrink = Math.max(0, 1.5 - evsWords); // words below a healthy span
    const collapsing = Math.max(0, -f[I.evsDelta]! * 10);
    const z =
      -3.2 +
      0.9 * shrink +
      0.4 * collapsing +
      1.0 * Math.min(1.5, f[I.fixation]!) +
      1.2 * f[I.regression]! +
      2.4 * f[I.diffMax]! +
      0.6 * Math.min(1.5, f[I.sinceAdvance]!) * f[I.speaking]! -
      0.8 * f[I.breakAhead]!;
    return sigmoid(z);
  }
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Keeps the rolling feature window and turns raw risk into stable UI actions:
 * slow the scroll while risk is high, highlight the hard word, with hysteresis
 * so the screen does not flicker.
 */
export class StumbleMonitor {
  private window: Float32Array[] = [];
  private smoothed = 0;
  private active = false;

  constructor(
    private predictor: StumblePredictor,
    private readonly onThreshold = 0.6,
    private readonly offThreshold = 0.4,
  ) {}

  setPredictor(p: StumblePredictor): void {
    this.predictor = p;
  }

  get predictorName(): string {
    return this.predictor.name;
  }

  async push(frame: Float32Array): Promise<{ risk: number; warning: boolean }> {
    this.window.push(frame);
    if (this.window.length > STUMBLE_SPEC.window) this.window.shift();
    const padded =
      this.window.length < STUMBLE_SPEC.window
        ? [...Array.from({ length: STUMBLE_SPEC.window - this.window.length }, () => new Float32Array(FEATURE_COUNT)), ...this.window]
        : this.window;
    const raw = await this.predictor.predict(padded);
    this.smoothed = 0.6 * this.smoothed + 0.4 * raw;
    if (this.smoothed >= this.onThreshold) this.active = true;
    else if (this.smoothed <= this.offThreshold) this.active = false;
    return { risk: this.smoothed, warning: this.active };
  }

  /** Scroll speed multiplier derived from current risk. */
  get slowFactor(): number {
    return this.active ? 0.55 : 1;
  }
}
