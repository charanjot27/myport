import { fitBestGazeModel, predictGaze, type CalibrationSample, type GazeModel } from "@promptsense/core";
import type { FocusFrame } from "./device";

/**
 * Gaze calibration in about 10 seconds. Nine points span the part of the
 * screen around the camera (wide enough to pin down the mapping), then two
 * validation points inside the text column measure the accuracy that matters.
 * Each point auto-advances once the eyes are steady.
 */

export interface Target {
  x: number;
  y: number;
}

export function targetsForFrame(f: FocusFrame, vw = window.innerWidth, vh = window.innerHeight): { calibrate: Target[]; validate: Target[] } {
  const top = f.top < vh / 2;
  const ys = top ? [0.07, 0.34, 0.62] : [0.38, 0.66, 0.93];
  const xs = [0.12, 0.5, 0.88];
  const calibrate: Target[] = [];
  // Start at the text column, then sweep the grid in a snake so the eyes travel short distances.
  calibrate.push({ x: (f.left + f.width / 2) / vw, y: (f.top + f.lineHeight * 0.6) / vh });
  ys.forEach((y, row) => (row % 2 ? [...xs].reverse() : xs).forEach((x) => calibrate.push({ x, y })));
  const n = (x: number, y: number) => ({ x: x / vw, y: y / vh });
  const mid = f.top + f.height / 2;
  return {
    calibrate,
    validate: [n(f.left + f.width * 0.25, mid), n(f.left + f.width * 0.75, mid)],
  };
}

export interface CalibrationIO {
  /** Show the dot at a target (normalised), or hide it. `phase` drives the animation. */
  showDot: (t: Target | null, phase: "approach" | "collect" | "done", index: number, total: number) => void;
  /** Latest face feature vector (null if no face or blinking) and its timestamp. */
  latest: () => { t: number; vector: number[] } | null;
  /** Short hint for the user ("Keep your head still"), or null to clear it. */
  hint?: (text: string | null) => void;
  signal?: AbortSignal;
}

export interface CalibrationResult {
  model: GazeModel;
  samples: CalibrationSample[];
  /** Mean validation error in CSS pixels. */
  errorPx: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FACE_X = 6;
const FACE_Y = 7;

function spread(v: number[][], dims: number[]): number {
  if (v.length < 2) return Infinity;
  let s = 0;
  for (const i of dims) {
    const m = v.reduce((a, x) => a + x[i]!, 0) / v.length;
    s += Math.sqrt(v.reduce((a, x) => a + (x[i]! - m) ** 2, 0) / v.length);
  }
  return s;
}

/** Collect steady samples for one target: stop early once 12 consecutive frames agree. */
async function collect(t: Target, io: CalibrationIO, index: number, total: number, approachMs = 520, maxMs = 1300): Promise<number[][]> {
  io.showDot(t, "approach", index, total);
  await sleep(approachMs);
  io.showDot(t, "collect", index, total);
  const out: number[][] = [];
  const start = performance.now();
  let lastT = -1;
  while (performance.now() - start < maxMs) {
    if (io.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const f = io.latest();
    if (f && f.t !== lastT) {
      lastT = f.t;
      out.push(f.vector);
      const recent = out.slice(-12);
      if (recent.length >= 12 && spread(recent, [0, 1, 2, 3]) < 0.08 && performance.now() - start > 420) break;
    }
    await sleep(16);
  }
  io.showDot(t, "done", index, total);
  // Drop the first frames: the eyes may still be landing on the dot.
  return out.slice(Math.min(4, Math.floor(out.length / 3)));
}

export async function runCalibration(targets: { calibrate: Target[]; validate: Target[] }, io: CalibrationIO): Promise<CalibrationResult> {
  const samples: CalibrationSample[] = [];
  const total = targets.calibrate.length + targets.validate.length;
  let home: number[] | null = null;
  let i = 0;
  for (const t of targets.calibrate) {
    const frames = await collect(t, io, i++, total);
    if (frames.length) {
      const f = frames[frames.length - 1]!;
      home ??= f;
      // Head movement during calibration is the main cause of poor accuracy.
      const moved = Math.hypot(f[FACE_X]! - home[FACE_X]!, f[FACE_Y]! - home[FACE_Y]!) > 0.04;
      io.hint?.(moved ? "Keep your head still and move only your eyes" : null);
    } else {
      io.hint?.("Can't see your eyes: face the screen with your face lit");
    }
    for (const f of frames) samples.push({ features: f, x: t.x, y: t.y });
  }
  if (samples.length < 40) throw new Error("Too few steady frames. Face the screen with your face well lit, then try again.");
  const model = fitBestGazeModel(samples);
  let err = 0;
  let n = 0;
  for (const t of targets.validate) {
    for (const f of await collect(t, io, i++, total, 450, 900)) {
      const g = predictGaze(model, f);
      err += Math.hypot((g.x - t.x) * window.innerWidth, (g.y - t.y) * window.innerHeight);
      n++;
    }
  }
  io.showDot(null, "done", total, total);
  io.hint?.(null);
  return { model, samples, errorPx: n ? err / n : Infinity };
}

/** Plain-language accuracy, relative to the text line height. */
export function describeAccuracy(errorPx: number, lineHeight: number): { label: "good" | "usable" | "poor"; lines: number } {
  const lines = errorPx / lineHeight;
  return { label: lines < 0.9 ? "good" : lines < 1.8 ? "usable" : "poor", lines };
}
