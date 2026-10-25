/**
 * Screen-light liveness (module 5). The prompter tints the screen with a
 * random colour sequence; a live face reflects the tint on skin with a small,
 * consistent delay. A replayed or synthesised face cannot know the sequence in
 * advance. The server issues and signs challenges; this module generates the
 * sequence deterministically from the server's seed and scores the response.
 *
 * Photosensitivity: steps last at least 350 ms (< 3 changes per second, inside
 * WCAG 2.3.1) and colours are low-saturation tints, not flashes.
 */

export interface ChallengeStep {
  rgb: [number, number, number];
  durationMs: number;
}

export interface LivenessChallenge {
  id: string;
  seed: string;
  steps: ChallengeStep[];
  totalMs: number;
}

export interface SkinSample {
  /** ms since the challenge started, on the same clock as the tint schedule. */
  t: number;
  rgb: [number, number, number];
}

export interface LivenessResult {
  score: number;
  lagMs: number;
  passed: boolean;
  samples: number;
  reason?: string;
}

/** Tints chosen to separate well across colour channels while staying gentle. */
const PALETTE: Array<[number, number, number]> = [
  [255, 170, 170],
  [170, 255, 170],
  [170, 170, 255],
  [255, 255, 170],
  [170, 255, 255],
  [255, 170, 255],
];

/** xmur3 + mulberry32: small, deterministic, good enough for challenge schedules. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateChallenge(id: string, seed: string, steps = 10): LivenessChallenge {
  const rand = seededRandom(seed);
  const out: ChallengeStep[] = [];
  let prev = -1;
  for (let i = 0; i < steps; i++) {
    let c = Math.floor(rand() * PALETTE.length);
    if (c === prev) c = (c + 1 + Math.floor(rand() * (PALETTE.length - 1))) % PALETTE.length;
    prev = c;
    out.push({ rgb: PALETTE[c]!, durationMs: 350 + Math.floor(rand() * 250) });
  }
  return { id, seed, steps: out, totalMs: out.reduce((a, s) => a + s.durationMs, 0) };
}

/** The tint colour at time t (ms since challenge start), or null outside the challenge. */
export function tintAt(ch: LivenessChallenge, t: number): [number, number, number] | null {
  if (t < 0) return null;
  let acc = 0;
  for (const s of ch.steps) {
    acc += s.durationMs;
    if (t < acc) return s.rgb;
  }
  return null;
}

function zscore(v: number[]): number[] {
  const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length || 1)) || 1;
  return v.map((x) => (x - m) / sd);
}

function pearson(a: number[], b: number[]): number {
  const za = zscore(a);
  const zb = zscore(b);
  let s = 0;
  for (let i = 0; i < za.length; i++) s += za[i]! * zb[i]!;
  return s / (za.length || 1);
}

/**
 * Correlate observed skin chromaticity with the emitted tint across a range
 * of lags. Chromaticity (each channel divided by brightness) cancels most of
 * the camera's auto-exposure, leaving the colour of the reflected light.
 */
export function scoreLiveness(
  ch: LivenessChallenge,
  samples: SkinSample[],
  opts: { maxLagMs?: number; threshold?: number } = {},
): LivenessResult {
  const maxLag = opts.maxLagMs ?? 400;
  const threshold = opts.threshold ?? 0.45;
  const inWindow = samples.filter((s) => s.t >= 0 && s.t <= ch.totalMs + maxLag);
  if (inWindow.length < 30) return { score: 0, lagMs: 0, passed: false, samples: inWindow.length, reason: "too few frames" };

  const chroma = inWindow.map((s) => {
    const sum = s.rgb[0] + s.rgb[1] + s.rgb[2] || 1;
    return [s.rgb[0] / sum, s.rgb[1] / sum, s.rgb[2] / sum] as const;
  });

  let best = -Infinity;
  let bestLag = 0;
  for (let lag = 0; lag <= maxLag; lag += 16) {
    const exp: number[][] = [[], [], []];
    const obs: number[][] = [[], [], []];
    inWindow.forEach((s, i) => {
      const tint = tintAt(ch, s.t - lag);
      if (!tint) return;
      const sum = tint[0] + tint[1] + tint[2];
      for (let c = 0; c < 3; c++) {
        exp[c]!.push(tint[c]! / sum);
        obs[c]!.push(chroma[i]![c]!);
      }
    });
    if (exp[0]!.length < 20) continue;
    const r = (pearson(exp[0]!, obs[0]!) + pearson(exp[1]!, obs[1]!) + pearson(exp[2]!, obs[2]!)) / 3;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  const score = Math.max(0, best);
  const passed = score >= threshold && bestLag <= 300;
  return {
    score,
    lagMs: bestLag,
    passed,
    samples: inWindow.length,
    ...(passed ? {} : { reason: score < threshold ? "reflection did not follow the screen" : "response too slow" }),
  };
}
