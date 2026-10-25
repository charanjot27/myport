import { FACE, type Point3 } from "@promptsense/core";

/**
 * Reflection check: does the prompter text show up in the speaker's eyes or
 * glasses on camera? We blink the text on and off and measure the brightest
 * pixels around each eye (the cornea and the lens area of glasses). If the
 * on/off difference rises above the frame-to-frame noise, the reflection is
 * visible, and we dim the text and test again.
 */

const CROP_W = 48;
const CROP_H = 32;

export class EyeGlareMeter {
  private readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor() {
    this.canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(CROP_W, CROP_H) : Object.assign(document.createElement("canvas"), { width: CROP_W, height: CROP_H });
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  }

  /**
   * Highlight level around both eyes: mean of the brightest 4% of pixels.
   * The crop covers about 1.3 eye-widths around each eye, which includes the
   * part of a glasses lens where screen reflections appear.
   */
  measure(video: HTMLVideoElement, lm: Point3[]): number | null {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const values: number[] = [];
    for (const eye of [FACE.eyeA, FACE.eyeB]) {
      const o = lm[eye.outer];
      const n = lm[eye.inner];
      if (!o || !n) return null;
      const cx = ((o.x + n.x) / 2) * w;
      const cy = ((o.y + n.y) / 2) * h;
      const ew = Math.hypot((o.x - n.x) * w, (o.y - n.y) * h);
      const sw = ew * 1.6;
      const sh = ew * 1.0;
      this.ctx.drawImage(video, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, CROP_W, CROP_H);
      const d = this.ctx.getImageData(0, 0, CROP_W, CROP_H).data;
      for (let i = 0; i < d.length; i += 4) values.push(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    }
    values.sort((a, b) => b - a);
    const k = Math.max(1, Math.floor(values.length * 0.04));
    let s = 0;
    for (let i = 0; i < k; i++) s += values[i]!;
    return s / k;
  }
}

export interface ReflectionTrial {
  level: number;
  on: number[];
  off: number[];
}

/** Is the on/off difference larger than chance? Welch-style test on the two sample sets. */
export function reflectionVisible(trial: Pick<ReflectionTrial, "on" | "off">, minEffect = 1.2): { visible: boolean; effect: number; noise: number } {
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const variance = (v: number[], m: number) => v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1);
  const mOn = mean(trial.on);
  const mOff = mean(trial.off);
  const se = Math.sqrt(variance(trial.on, mOn) / Math.max(1, trial.on.length) + variance(trial.off, mOff) / Math.max(1, trial.off.length));
  const effect = mOn - mOff;
  return { visible: effect > Math.max(minEffect, 3 * se), effect, noise: se };
}

export const REFLECTION_LEVELS = [1, 0.8, 0.64, 0.5, 0.38, 0.28];

export interface ReflectionResult {
  /** Chosen text brightness. */
  level: number;
  visibleAtFull: boolean;
  /** Still visible at the dimmest level: the user should lower screen brightness or tilt the screen. */
  stillVisible: boolean;
  trials: Array<{ level: number; effect: number; noise: number; visible: boolean }>;
}

export interface ReflectionRunOptions {
  /** Show the test text at a brightness level, or hide it (null). */
  show: (level: number | null) => void;
  /** Latest glare reading, or null when no face is visible. */
  sample: () => number | null;
  cycles?: number;
  phaseMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runReflectionCheck(opts: ReflectionRunOptions): Promise<ReflectionResult> {
  const cycles = opts.cycles ?? 3;
  const phase = opts.phaseMs ?? 420;
  const trials: ReflectionResult["trials"] = [];

  const collect = async (into: number[]) => {
    // Skip the first part of each phase so camera exposure can settle.
    await sleep(phase * 0.35);
    const end = performance.now() + phase * 0.65;
    while (performance.now() < end) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const v = opts.sample();
      if (v !== null) into.push(v);
      await sleep(33);
    }
  };

  for (const level of REFLECTION_LEVELS) {
    const trial: ReflectionTrial = { level, on: [], off: [] };
    for (let c = 0; c < cycles; c++) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      opts.show(level);
      await collect(trial.on);
      opts.show(null);
      await collect(trial.off);
    }
    if (trial.on.length < 3 || trial.off.length < 3) throw new Error("Your face wasn't visible during the check. Face the screen and try again.");
    const r = reflectionVisible(trial);
    trials.push({ level, ...r });
    if (!r.visible) {
      opts.show(null);
      // Not visible at full brightness: keep a comfortable default rather than maximum.
      return { level: level === 1 ? 0.85 : level, visibleAtFull: trials[0]!.visible, stillVisible: false, trials };
    }
  }
  opts.show(null);
  return { level: REFLECTION_LEVELS[REFLECTION_LEVELS.length - 1]!, visibleAtFull: true, stillVisible: true, trials };
}
