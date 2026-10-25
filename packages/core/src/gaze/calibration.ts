/**
 * Per-user gaze calibration: ridge regression from face features to normalised
 * screen coordinates. The model is tiny (a few dozen weights) so it fits
 * instantly in the browser and can be stored with the user's settings.
 *
 * Robustness matters more than flexibility with webcam data:
 *  - features are standardised with a noise floor, so a feature that barely
 *    moved during calibration (head position) cannot amplify jitter later;
 *  - a linear and a quadratic model are both tried and the one with the lower
 *    leave-one-target-out error wins, which stops overfitting on few points;
 *  - predictions are clamped to just beyond the screen.
 */

export interface CalibrationSample {
  features: number[];
  /** Target the user was looking at, normalised screen coords. */
  x: number;
  y: number;
}

/** Names of the entries in FaceFeatures.vector, in order. */
export const GAZE_FEATURES = ["iris_h", "iris_v", "look_h", "look_v", "yaw", "pitch", "face_x", "face_y", "face_scale"] as const;

/** Smallest standard deviation used when standardising each feature (its typical noise level). */
const STD_FLOOR = [0.012, 0.012, 0.06, 0.06, 0.03, 0.03, 0.01, 0.01, 0.006];

export interface GazeModel {
  version: 2;
  degree: 1 | 2;
  lambda: number;
  wx: number[];
  wy: number[];
  mean: number[];
  std: number[];
  /** Mean error on the calibration samples (normalised units). */
  trainError: number;
  /** Leave-one-target-out error used for model selection (normalised units), if computed. */
  cvError?: number;
}

/** True if the model was fitted on the current feature layout. */
export function isGazeModelCompatible(model: unknown): model is GazeModel {
  const m = model as Partial<GazeModel> | null;
  return !!m && m.version === 2 && Array.isArray(m.mean) && m.mean.length === GAZE_FEATURES.length;
}

/** Standardised features with bias, plus quadratic eye terms for degree 2. */
export function expand(f: number[], mean: number[], std: number[], degree: 1 | 2 = 2): number[] {
  const z = f.map((v, i) => (v - (mean[i] ?? 0)) / (std[i] || 1));
  const row = [1, ...z];
  if (degree === 2) {
    const [ih = 0, iv = 0, lh = 0, lv = 0, yaw = 0, pitch = 0] = z;
    row.push(ih * ih, iv * iv, ih * iv, lh * lh, lv * lv, lh * lv, ih * yaw, iv * pitch);
  }
  return row;
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

function stats(samples: CalibrationSample[]): { mean: number[]; std: number[] } {
  const dims = samples[0]!.features.length;
  const mean = new Array<number>(dims).fill(0);
  const std = new Array<number>(dims).fill(0);
  for (const s of samples) s.features.forEach((v, i) => (mean[i]! += v / samples.length));
  for (const s of samples) s.features.forEach((v, i) => (std[i]! += (v - mean[i]!) ** 2 / samples.length));
  for (let i = 0; i < dims; i++) std[i] = Math.max(Math.sqrt(std[i]!), STD_FLOOR[i] ?? 0.01);
  return { mean, std };
}

export function fitGazeModel(samples: CalibrationSample[], lambda = 1, degree: 1 | 2 = 2): GazeModel {
  if (samples.length < 6) throw new Error("need at least 6 calibration samples");
  const { mean, std } = stats(samples);
  const rows = samples.map((s) => expand(s.features, mean, std, degree));
  const wx = ridgeSolve(rows, samples.map((s) => s.x), lambda);
  const wy = ridgeSolve(rows, samples.map((s) => s.y), lambda);
  const model: GazeModel = { version: 2, degree, lambda, wx, wy, mean, std, trainError: 0 };
  model.trainError = meanError(model, samples);
  return model;
}

function meanError(model: GazeModel, samples: CalibrationSample[]): number {
  let err = 0;
  for (const s of samples) {
    const p = predictGaze(model, s.features);
    err += Math.hypot(p.x - s.x, p.y - s.y);
  }
  return err / (samples.length || 1);
}

const key = (s: CalibrationSample) => `${s.x.toFixed(4)},${s.y.toFixed(4)}`;

/**
 * Pick degree and regularisation by leave-one-target-out cross-validation:
 * each calibration point is predicted by a model that never saw it, which is
 * exactly the situation while reading.
 */
export function fitBestGazeModel(samples: CalibrationSample[]): GazeModel {
  const groups = new Map<string, CalibrationSample[]>();
  for (const s of samples) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
  if (groups.size < 5) return fitGazeModel(samples, 1, 1);
  let best: { degree: 1 | 2; lambda: number; err: number } | null = null;
  for (const degree of [1, 2] as const) {
    if (degree === 2 && groups.size < 7) continue;
    for (const lambda of [0.3, 1, 3, 10]) {
      let err = 0;
      let n = 0;
      for (const [k, held] of groups) {
        const train = samples.filter((s) => key(s) !== k);
        if (train.length < 6) continue;
        const m = fitGazeModel(train, lambda, degree);
        err += meanError(m, held) * held.length;
        n += held.length;
      }
      const e = n ? err / n : Infinity;
      if (!best || e < best.err) best = { degree, lambda, err: e };
    }
  }
  const model = fitGazeModel(samples, best!.lambda, best!.degree);
  model.cvError = best!.err;
  return model;
}

/** Predicted gaze in normalised screen coordinates, or NaN when the model does not fit these features. */
export function predictGaze(model: GazeModel, features: number[]): { x: number; y: number } {
  if (model.mean.length !== features.length) return { x: Number.NaN, y: Number.NaN };
  const row = expand(features, model.mean, model.std, model.degree ?? 2);
  let x = 0;
  let y = 0;
  for (let i = 0; i < row.length; i++) {
    x += row[i]! * (model.wx[i] ?? 0);
    y += row[i]! * (model.wy[i] ?? 0);
  }
  const clamp = (v: number) => Math.max(-0.2, Math.min(1.2, v));
  return { x: clamp(x), y: clamp(y) };
}

/** 9-point calibration grid with a margin, in normalised screen coords. */
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
    if (!Number.isFinite(x)) return x;
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
