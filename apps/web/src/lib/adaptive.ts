import type { Point3 } from "@promptsense/core";
import { reflectionVisible } from "./reflection";

/**
 * Adaptive anti-glare text. Browsers cannot read the screen brightness or the
 * laptop's light sensor, so we measure their effects through the camera:
 *
 *  - Room light: the average brightness of the camera image. In a darker room
 *    the text can be dimmer and still readable (and the screen is then the
 *    main light, so reflections stand out more); in a bright room it needs to
 *    be brighter.
 *  - Glare: every ~30 s a short, subtle brightness pulse is applied to the text
 *    and we check whether the highlights in the eyes or glasses pulse with it
 *    (lock-in detection). If they do, the reflection is visible on camera and
 *    the brightness ceiling is lowered; after clean probes it slowly relaxes.
 *    Changes in screen brightness show up here automatically.
 */

export interface AdaptiveOptions {
  /** User's preferred brightness (0.2..1). */
  base: number;
  /** Highest brightness known to be reflection-free (from the setup check), 0.2..1. */
  ceiling: number;
  /** ms after start before the first probe. */
  firstProbeMs?: number;
  /** ms between probes. */
  probeEveryMs?: number;
  halfCycleMs?: number;
  cycles?: number;
  /** Brightness factor during the "low" half of a probe. */
  probeDepth?: number;
}

export interface AdaptiveSnapshot {
  level: number;
  ceiling: number;
  ambientRatio: number;
  probing: boolean;
  lastProbe: { visible: boolean; effect: number } | null;
  /** Suggested font weight: dimmer text is drawn a little bolder to stay legible. */
  weight: number;
  /** Warmer tone in dark rooms. */
  warm: boolean;
}

const MIN_LEVEL = 0.22;

export class AdaptiveBrightness {
  private base: number;
  private ceiling: number;
  private level: number;
  private ambient: number | null = null;
  private baseline: number | null = null;
  private baselineSamples: number[] = [];
  private startT: number | null = null;
  private nextProbeT = 0;
  private probe: { start: number; on: number[]; off: number[] } | null = null;
  private lastProbe: AdaptiveSnapshot["lastProbe"] = null;
  private cleanStreak = 0;
  private readonly o: Required<AdaptiveOptions>;

  constructor(opts: AdaptiveOptions) {
    this.o = { firstProbeMs: 5000, probeEveryMs: 30000, halfCycleMs: 400, cycles: 3, probeDepth: 0.72, ...opts };
    this.base = opts.base;
    this.ceiling = Math.max(MIN_LEVEL, Math.min(1, opts.ceiling));
    this.level = Math.min(this.base, this.ceiling);
  }

  setBase(base: number): void {
    this.base = Math.max(MIN_LEVEL, Math.min(1, base));
  }

  /** True while a probe needs glare readings (only then is the eye-region measurement worth its cost). */
  wantsGlare(t: number): boolean {
    return this.probe !== null || (this.startT !== null && t >= this.nextProbeT - 50);
  }

  /** Feed one camera frame's measurements. `ambient` is mean image luminance (0..255); `glare` is EyeGlareMeter output. */
  update(t: number, ambient: number | null, glare: number | null): void {
    if (this.startT === null) {
      this.startT = t;
      this.nextProbeT = t + this.o.firstProbeMs;
    }
    if (ambient !== null) {
      this.ambient = this.ambient === null ? ambient : this.ambient + (ambient - this.ambient) * 0.03;
      if (this.baseline === null) {
        this.baselineSamples.push(ambient);
        if (t - this.startT > 1500 && this.baselineSamples.length >= 10) {
          this.baseline = this.baselineSamples.reduce((a, b) => a + b, 0) / this.baselineSamples.length;
        }
      }
    }

    if (!this.probe && t >= this.nextProbeT) this.probe = { start: t, on: [], off: [] };
    if (this.probe) {
      const half = this.o.halfCycleMs;
      const elapsed = t - this.probe.start;
      const k = Math.floor(elapsed / half);
      // Skip the start of each half-cycle: camera latency and exposure need a moment.
      if (glare !== null && elapsed % half > half * 0.4) (k % 2 === 0 ? this.probe.on : this.probe.off).push(glare);
      if (k >= this.o.cycles * 2) this.finishProbe(t);
    }

    // Smoothly follow the target level outside probes.
    const target = this.targetLevel();
    this.level += (target - this.level) * 0.06;
  }

  private finishProbe(t: number): void {
    const p = this.probe!;
    this.probe = null;
    this.nextProbeT = t + this.o.probeEveryMs;
    if (p.on.length < 3 || p.off.length < 3) return; // no face during the probe
    const r = reflectionVisible(p, 0.8);
    this.lastProbe = { visible: r.visible, effect: r.effect };
    if (r.visible) {
      this.ceiling = Math.max(MIN_LEVEL, this.level * 0.85);
      this.cleanStreak = 0;
      // Check again soon to confirm the new level is clean.
      this.nextProbeT = t + Math.min(this.o.probeEveryMs, 8000);
    } else if (++this.cleanStreak >= 2) {
      this.ceiling = Math.min(1, this.ceiling * 1.06);
      this.cleanStreak = 0;
    }
  }

  private get ambientRatio(): number {
    return this.ambient !== null && this.baseline ? this.ambient / this.baseline : 1;
  }

  private targetLevel(): number {
    const roomFactor = Math.max(0.65, Math.min(1.4, Math.pow(this.ambientRatio, 0.45)));
    return Math.max(MIN_LEVEL, Math.min(this.ceiling, this.base * roomFactor));
  }

  /** Brightness to draw right now (includes the probe's modulation). */
  displayLevel(t: number): number {
    if (!this.probe) return this.level;
    const k = Math.floor((t - this.probe.start) / this.o.halfCycleMs);
    return k % 2 === 0 ? this.level : this.level * this.o.probeDepth;
  }

  snapshot(): AdaptiveSnapshot {
    const ratio = this.ambientRatio;
    return {
      level: this.level,
      ceiling: this.ceiling,
      ambientRatio: ratio,
      probing: this.probe !== null,
      lastProbe: this.lastProbe,
      weight: Math.round(500 + Math.max(0, 0.85 - this.level) * 300),
      warm: ratio < 0.75,
    };
  }
}

/** Mean luminance of a downscaled camera frame, excluding the face (the face is lit by the screen itself). */
export class AmbientMeter {
  private readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(private readonly w = 32, private readonly h = 18) {
    this.canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  }

  measure(video: HTMLVideoElement, lm: Point3[] | null): number | null {
    if (!video.videoWidth) return null;
    this.ctx.drawImage(video, 0, 0, this.w, this.h);
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    if (lm) {
      for (const p of lm) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    let sum = 0;
    let n = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const nx = (x + 0.5) / this.w;
        const ny = (y + 0.5) / this.h;
        if (lm && nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) continue;
        const i = (y * this.w + x) * 4;
        sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
        n++;
      }
    }
    return n ? sum / n : null;
  }
}
