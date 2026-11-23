/**
 * Scroll physics. The controller never jumps: it eases toward a target with a
 * critically damped spring so the text stays readable while it moves.
 */

export type ScrollMode = "voice" | "fixed" | "manual";

export interface ScrollControllerOptions {
  /** Seconds for the spring to settle most of the way to a new target. */
  responseTime: number;
  /** Hard cap on scroll speed (px/s) so large jumps stay readable. */
  maxSpeed: number;
  /** Speed for fixed mode (px/s). */
  fixedSpeed: number;
}

export interface StepInput {
  /** Hold still (looking away, paused by gesture). */
  paused?: boolean;
  /** 0..1 multiplier applied to motion, used to slow down ahead of a predicted stumble. */
  slowFactor?: number;
}

export class ScrollController {
  position = 0;
  velocity = 0;
  target = 0;
  mode: ScrollMode = "voice";
  readonly options: ScrollControllerOptions;
  private maxPosition = Infinity;

  constructor(options: Partial<ScrollControllerOptions> = {}) {
    this.options = { responseTime: 0.45, maxSpeed: 900, fixedSpeed: 40, ...options };
  }

  setBounds(maxPosition: number): void {
    this.maxPosition = Math.max(0, maxPosition);
    this.target = Math.min(this.target, this.maxPosition);
  }

  setTarget(px: number): void {
    this.target = Math.max(0, Math.min(this.maxPosition, px));
  }

  /** Jump without animation (seek, section change by keyboard). */
  jumpTo(px: number): void {
    this.setTarget(px);
    this.position = this.target;
    this.velocity = 0;
  }

  /** Advance the simulation by `dtMs` and return the new scroll position. */
  step(dtMs: number, input: StepInput = {}): number {
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
    const slow = Math.max(0, Math.min(1, input.slowFactor ?? 1));
    if (input.paused || this.mode === "manual") {
      this.velocity = 0;
      if (this.mode === "manual") this.position = this.target;
      return this.position;
    }

    if (this.mode === "fixed") {
      this.velocity = this.options.fixedSpeed * slow;
      this.position = Math.min(this.maxPosition, this.position + this.velocity * dt);
      this.target = this.position;
      return this.position;
    }

    // Critically damped spring: x'' = k (target - x) - 2 sqrt(k) x'
    const omega = 4 / this.options.responseTime;
    const k = omega * omega;
    const c = 2 * omega;
    const accel = k * (this.target - this.position) - c * this.velocity;
    this.velocity += accel * dt;
    const cap = this.options.maxSpeed * (0.25 + 0.75 * slow);
    this.velocity = Math.max(-cap, Math.min(cap, this.velocity));
    // Never travel more than one 60 fps frame's worth at full speed in a single step: after the
    // page stalls (a long frame), catch up over the next frames instead of lurching.
    const maxTravel = (cap / 60) * 1.2;
    this.position += Math.max(-maxTravel, Math.min(maxTravel, this.velocity * dt));
    if (Math.abs(this.target - this.position) < 0.25 && Math.abs(this.velocity) < 1) {
      this.position = this.target;
      this.velocity = 0;
    }
    this.position = Math.max(0, Math.min(this.maxPosition, this.position));
    return this.position;
  }
}

/**
 * Where the scroll target should be so the spoken word sits on the reading line.
 * @param wordTop     y of the current word's line inside the scroll content (px)
 * @param readingLine fraction of the viewport height where the active line should sit
 */
export function targetForWord(wordTop: number, viewportHeight: number, readingLine = 0.3): number {
  return Math.max(0, wordTop - viewportHeight * readingLine);
}
