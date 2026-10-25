import type { ParsedScript } from "../text/script.js";

/**
 * Feature extraction for eye-voice span stumble prediction (module 1).
 *
 * Frames are produced at FRAME_HZ. The predictor sees the last WINDOW frames
 * and outputs the probability that a stumble begins within the prediction
 * horizon. The same spec is exported to the Python training code
 * (ml/promptsense_ml/spec.py mirrors it, and a test keeps them in sync).
 */

export const STUMBLE_SPEC = {
  version: 1,
  frameHz: 10,
  window: 20,
  /** A frame is labelled positive if a stumble starts this many seconds later. */
  horizon: { min: 0.3, max: 2.0 },
  features: [
    "evs_words",
    "evs_delta",
    "gaze_valid",
    "fixation_s",
    "regression",
    "next_difficulty_max",
    "next_difficulty_mean",
    "speech_rate",
    "since_advance_s",
    "speaking",
    "align_confidence",
    "off_script",
    "break_ahead",
  ],
} as const;

export type StumbleFeatureName = (typeof STUMBLE_SPEC.features)[number];
export const FEATURE_COUNT = STUMBLE_SPEC.features.length;

export interface FrameInput {
  t: number;
  /** Script word the speaker is on (from the aligner). */
  speechWord: number;
  /** Estimated script word under the gaze, or null if gaze is off the text/unknown. */
  gazeWord: number | null;
  speaking: boolean;
  alignConfidence: number;
  offScript: boolean;
}

/** Stateful extractor: feed one FrameInput per frame, get one feature vector back. */
export class StumbleFeatureExtractor {
  private history: Array<{ t: number; evs: number | null; gazeWord: number | null; speechWord: number }> = [];
  private lastAdvanceT = 0;
  private lastSpeechWord = -1;
  private fixationStart = 0;
  private fixationWord: number | null = null;
  private wordTimes: number[] = [];

  constructor(private readonly script: ParsedScript) {}

  reset(): void {
    this.history = [];
    this.lastSpeechWord = -1;
    this.fixationWord = null;
    this.wordTimes = [];
  }

  next(f: FrameInput): Float32Array {
    const out = new Float32Array(FEATURE_COUNT);
    const evs = f.gazeWord === null ? null : f.gazeWord - f.speechWord;
    this.history.push({ t: f.t, evs, gazeWord: f.gazeWord, speechWord: f.speechWord });
    while (this.history.length && this.history[0]!.t < f.t - 3000) this.history.shift();

    if (f.speechWord > this.lastSpeechWord) {
      for (let i = this.lastSpeechWord + 1; i <= f.speechWord; i++) this.wordTimes.push(f.t);
      this.lastSpeechWord = f.speechWord;
      this.lastAdvanceT = f.t;
    }
    while (this.wordTimes.length && this.wordTimes[0]! < f.t - 3000) this.wordTimes.shift();

    if (f.gazeWord === null || this.fixationWord === null || Math.abs(f.gazeWord - this.fixationWord) > 1) {
      this.fixationWord = f.gazeWord;
      this.fixationStart = f.t;
    }

    const halfSecAgo = this.history.find((h) => h.t >= f.t - 500);
    const prevEvs = halfSecAgo?.evs ?? evs;
    let regression = 0;
    if (f.gazeWord !== null) {
      for (const h of this.history) {
        if (h.t >= f.t - 500 && h.gazeWord !== null && h.gazeWord - f.gazeWord > 2) regression = 1;
      }
    }

    const words = this.script.words;
    const ahead = words.slice(f.speechWord + 1, f.speechWord + 5);
    const diffs = ahead.map((w) => w.difficulty);
    const current = words[f.speechWord];
    const breakAhead = current?.sentenceEnd || ahead[0]?.cues.length ? 1 : 0;

    out[0] = clamp(evs ?? 0, -10, 20) / 10;
    out[1] = clamp((evs ?? 0) - (prevEvs ?? 0), -10, 10) / 10;
    out[2] = f.gazeWord === null ? 0 : 1;
    out[3] = f.gazeWord === null ? 0 : Math.min(3, (f.t - this.fixationStart) / 1000);
    out[4] = regression;
    out[5] = diffs.length ? Math.max(...diffs) : 0;
    out[6] = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    out[7] = Math.min(8, this.wordTimes.length / 3) / 4;
    out[8] = Math.min(3, (f.t - this.lastAdvanceT) / 1000);
    out[9] = f.speaking ? 1 : 0;
    out[10] = clamp(f.alignConfidence, 0, 1);
    out[11] = f.offScript ? 1 : 0;
    out[12] = breakAhead;
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
