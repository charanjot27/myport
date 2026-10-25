/**
 * Per-user gaze calibration: ridge regression from face features to normalised
 * screen coordinates, using second-order terms of the eye features. The model
 * is tiny (a few dozen weights) so it fits instantly in the browser and can be
 * stored with the user's settings.
 */

export interface CalibrationSample {
  features: number[];
  /** Target the user was looking at, normalised screen coords. */
  x: number;
  y: number;
}

export interface GazeModel {
  version: 1;
  wx: number[];
  wy: number[];
  mean: number[];
  std: number[];
  /** Mean absolute error on the calibration samples (normalised units). */
  trainError: number;
}

/** Polynomial expansion: bias, linear terms, and quadratic terms of the two eye features. */
export function expand(f: number[], mean: number[], std: number[]): number[] {
  const z = f.map((v, i) => (v - (mean[i] ?? 0)) / (std[i] || 1));
  const gx = z[0] ?? 0;
  const gy = z[1] ?? 0;
  return [1, ...z, gx * gx, gy * gy, gx * gy, gx * (z[2] ?? 0), gy * (z[3] ?? 0)];
}

/** Solve (A^T A + λI) w = A^T b with Gaussian elimination and partial pivoting. */
export function ridgeSolve(rows: number[][], b: number[], lambda: number): number[] {
  const d = rows[0]?.length ?? 0;
  const m: number[][] = Array.from({ length: d }, () => new Array<number>(d + 1).fill(0));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) m[i]![j]! += row[i]! * row[j]!;
      m[i]![d]! += row[i]! * b[r]!;
    }
  }
  for (let i = 1; i < d; i++) m[i]![i]! += lambda; // do not regularise the bias
  for (let col = 0; col < d; col++) {
    let pivot = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) continue;
    for (let j = col; j <= d; j++) m[col]![j]! /= p;
    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (!f) continue;
      for (let j = col; j <= d; j++) m[r]![j]! -= f * m[col]![j]!;
    }
  }
  return m.map((row) => row[d]!);
}

export function fitGazeModel(samples: CalibrationSample[], lambda = 0.5): GazeModel {
  if (samples.length < 6) throw new Error("need at least 6 calibration samples");
  const dims = samples[0]!.features.length;
  const mean = new Array<number>(dims).fill(0);
  const std = new Array<number>(dims).fill(0);
  for (const s of samples) s.features.forEach((v, i) => (mean[i]! += v / samples.length));
  for (const s of samples) s.features.forEach((v, i) => (std[i]! += (v - mean[i]!) ** 2 / samples.length));
  for (let i = 0; i < dims; i++) std[i] = Math.sqrt(std[i]!) || 1;

  const rows = samples.map((s) => expand(s.features, mean, std));
  const wx = ridgeSolve(rows, samples.map((s) => s.x), lambda);
  const wy = ridgeSolve(rows, samples.map((s) => s.y), lambda);
  const model: GazeModel = { version: 1, wx, wy, mean, std, trainError: 0 };
  let err = 0;
  for (const s of samples) {
    const p = predictGaze(model, s.features);
    err += Math.hypot(p.x - s.x, p.y - s.y);
  }
  model.trainError = err / samples.length;
  return model;
}

export function predictGaze(model: GazeModel, features: number[]): { x: number; y: number } {
  const row = expand(features, model.mean, model.std);
  let x = 0;
  let y = 0;
  for (let i = 0; i < row.length; i++) {
    x += row[i]! * (model.wx[i] ?? 0);
    y += row[i]! * (model.wy[i] ?? 0);
  }
  return { x, y };
}

/** Standard 9-point calibration grid with a margin, in normalised screen coords. */
export function calibrationGrid(margin = 0.1): Array<{ x: number; y: number }> {
  const v = [margin, 0.5, 1 - margin];
  const out: Array<{ x: number; y: number }> = [];
  for (const y of v) for (const x of v) out.push({ x, y });
  return out;
}

/**
 * One Euro filter (Casiez et al. 2012): smooths jitter when the signal is still
 * and keeps lag low when it moves fast. Ideal for webcam gaze.
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.02,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.xPrev = null;
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null || !Number.isFinite(this.xPrev)) {
      this.xPrev = x;
      this.tPrev = tMs;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}
