import { fitGazeModel, predictGaze, type CalibrationSample, type GazeModel } from "@promptsense/core";
import type { FocusFrame } from "./device";

/**
 * Fast gaze calibration. Points are placed only where text will be (the
 * camera-layout column), so a handful of points covers everything that
 * matters. Each point auto-advances as soon as the eyes are steady instead of
 * waiting a fixed time, so a full run takes about 6–8 seconds.
 */

export interface Target {
  x: number;
  y: number;
}

/** 5 calibration points inside the text column plus 2 validation points, in normalised window coordinates. */
export function targetsForFrame(f: FocusFrame, vw = window.innerWidth, vh = window.innerHeight): { calibrate: Target[]; validate: Target[] } {
  const xs = [f.left + f.width * 0.08, f.left + f.width * 0.5, f.left + f.width * 0.92];
  const top = f.top + f.lineHeight * 0.6;
  const bottom = f.top + f.height - f.lineHeight * 0.6;
  const n = (x: number, y: number) => ({ x: x / vw, y: y / vh });
  return {
    calibrate: [n(xs[1]!, top), n(xs[0]!, top), n(xs[2]!, top), n(xs[2]!, bottom), n(xs[0]!, bottom)],
    validate: [n(f.left + f.width * 0.3, (top + bottom) / 2), n(f.left + f.width * 0.7, bottom)],
  };
}

export interface CalibrationIO {
  /** Show the dot at a target (normalised), or hide it. `collecting` shrinks it. */
  showDot: (t: Target | null, collecting: boolean) => void;
  /** Latest face feature vector (null if no face or blinking) and its timestamp. */
  latest: () => { t: number; vector: number[] } | null;
  signal?: AbortSignal;
}

export interface CalibrationResult {
  model: GazeModel;
  samples: CalibrationSample[];
  /** Mean validation error in CSS pixels. */
  errorPx: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spread(v: number[][]): number {
  if (v.length < 2) return Infinity;
  let s = 0;
  for (const i of [0, 1]) {
    const m = v.reduce((a, x) => a + x[i]!, 0) / v.length;
    s += Math.sqrt(v.reduce((a, x) => a + (x[i]! - m) ** 2, 0) / v.length);
  }
  return s;
}

/** Collect steady samples for one target: stop early once 10 consecutive frames agree. */
async function collect(t: Target, io: CalibrationIO, settleMs = 380, maxMs = 1400): Promise<number[][]> {
  io.showDot(t, false);
  await sleep(settleMs);
  io.showDot(t, true);
  const out: number[][] = [];
  const start = performance.now();
  let lastT = -1;
  while (performance.now() - start < maxMs) {
    if (io.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const f = io.latest();
    if (f && f.t !== lastT) {
      lastT = f.t;
      out.push(f.vector);
      const recent = out.slice(-10);
      if (recent.length >= 10 && spread(recent) < 0.02 && performance.now() - start > 450) break;
    }
    await sleep(16);
  }
  // Drop the first few frames: the eyes may still be landing on the dot.
  return out.slice(Math.min(3, Math.floor(out.length / 3)));
}

export async function runCalibration(targets: { calibrate: Target[]; validate: Target[] }, io: CalibrationIO): Promise<CalibrationResult> {
  const samples: CalibrationSample[] = [];
  for (const t of targets.calibrate) {
    for (const f of await collect(t, io)) samples.push({ features: f, x: t.x, y: t.y });
  }
  if (samples.length < 20) throw new Error("Too few steady frames. Check that your face is well lit and try again.");
  const model = fitGazeModel(samples, 0.3);
  let err = 0;
  let n = 0;
  for (const t of targets.validate) {
    for (const f of await collect(t, io, 320, 900)) {
      const g = predictGaze(model, f);
      err += Math.hypot((g.x - t.x) * window.innerWidth, (g.y - t.y) * window.innerHeight);
      n++;
    }
  }
  io.showDot(null, false);
  return { model, samples, errorPx: n ? err / n : Infinity };
}

/** Plain-language accuracy, relative to the text line height. */
export function describeAccuracy(errorPx: number, lineHeight: number): { label: "good" | "usable" | "poor"; lines: number } {
  const lines = errorPx / lineHeight;
  return { label: lines < 0.8 ? "good" : lines < 1.6 ? "usable" : "poor", lines };
}
