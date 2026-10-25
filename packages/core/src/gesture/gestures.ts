import type { Point3 } from "../gaze/landmarks.js";

/**
 * Rule-based hand gesture classifier on MediaPipe's 21 hand landmarks, plus a
 * debouncer that turns noisy per-frame labels into deliberate commands.
 */

export type Gesture = "open_palm" | "fist" | "point_up" | "victory" | "thumbs_up" | "thumbs_down" | "none";
export type PrompterCommand = "toggle_pause" | "rewind_sentence" | "next_section" | "previous_section" | "resume";

export const DEFAULT_GESTURE_MAP: Partial<Record<Gesture, PrompterCommand>> = {
  open_palm: "toggle_pause",
  point_up: "rewind_sentence",
  victory: "next_section",
  thumbs_down: "previous_section",
  thumbs_up: "resume",
};

const WRIST = 0;
const FINGERS = [
  { mcp: 5, pip: 6, tip: 8 },
  { mcp: 9, pip: 10, tip: 12 },
  { mcp: 13, pip: 14, tip: 16 },
  { mcp: 17, pip: 18, tip: 20 },
];
const THUMB = { mcp: 2, ip: 3, tip: 4 };

const d = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);

export function classifyHand(lm: Point3[]): Gesture {
  if (lm.length < 21) return "none";
  const wrist = lm[WRIST]!;
  const palm = d(wrist, lm[9]!) || 1e-6;
  const extended = FINGERS.map((f) => d(wrist, lm[f.tip]!) > d(wrist, lm[f.pip]!) * 1.15 && d(wrist, lm[f.tip]!) > palm * 1.2);
  const thumbTip = lm[THUMB.tip]!;
  const thumbOut = d(thumbTip, lm[5]!) > palm * 0.65 && d(wrist, thumbTip) > d(wrist, lm[THUMB.ip]!);
  const n = extended.filter(Boolean).length;
  const [index, middle, ring, pinky] = extended;

  if (n === 4 && thumbOut) return "open_palm";
  if (index && middle && !ring && !pinky) return "victory";
  if (index && !middle && !ring && !pinky) {
    return lm[8]!.y < wrist.y - palm * 0.6 ? "point_up" : "none";
  }
  if (n === 0) {
    if (thumbOut) {
      const dy = thumbTip.y - lm[THUMB.mcp]!.y;
      if (dy < -palm * 0.35) return "thumbs_up";
      if (dy > palm * 0.35) return "thumbs_down";
    }
    return "fist";
  }
  return "none";
}

/** Requires a gesture to be held for `holdMs` and enforces a cooldown between commands. */
export class GestureDebouncer {
  private current: Gesture = "none";
  private since = 0;
  private lastFire = -Infinity;
  private firedForCurrent = false;

  constructor(
    private readonly map: Partial<Record<Gesture, PrompterCommand>> = DEFAULT_GESTURE_MAP,
    private readonly holdMs = 450,
    private readonly cooldownMs = 1200,
  ) {}

  update(g: Gesture, t: number): PrompterCommand | null {
    if (g !== this.current) {
      this.current = g;
      this.since = t;
      this.firedForCurrent = false;
      return null;
    }
    const cmd = this.map[g];
    if (!cmd || this.firedForCurrent) return null;
    if (t - this.since >= this.holdMs && t - this.lastFire >= this.cooldownMs) {
      this.lastFire = t;
      this.firedForCurrent = true;
      return cmd;
    }
    return null;
  }

  /** 0..1 progress of the current hold, for an on-screen ring indicator. */
  progress(t: number): number {
    if (!this.map[this.current] || this.firedForCurrent) return 0;
    return Math.min(1, (t - this.since) / this.holdMs);
  }

  get gesture(): Gesture {
    return this.current;
  }
}

/** Mean landmark speed between two frames, used as a fidget signal (normalised units per second). */
export function handMotionEnergy(prev: Point3[] | null, cur: Point3[], dtMs: number): number {
  if (!prev || prev.length !== cur.length || dtMs <= 0) return 0;
  let s = 0;
  for (let i = 0; i < cur.length; i++) s += Math.hypot(cur[i]!.x - prev[i]!.x, cur[i]!.y - prev[i]!.y);
  return s / cur.length / (dtMs / 1000);
}
