/**
 * The fusion timeline: one shared, time-ordered record of everything the
 * perception layer sees. Every module reads from it instead of talking to the
 * camera or microphone directly, so they all agree on "now".
 */

export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (capacity <= 0) throw new Error("capacity must be positive");
    this.items = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    this.items[(this.head + this.count) % this.capacity] = item;
    if (this.count < this.capacity) this.count++;
    else this.head = (this.head + 1) % this.capacity;
  }

  /** Item `i` positions from the oldest (0) to newest (size - 1). */
  at(i: number): T | undefined {
    if (i < 0 || i >= this.count) return undefined;
    return this.items[(this.head + i) % this.capacity];
  }

  last(): T | undefined {
    return this.at(this.count - 1);
  }

  /** The newest `n` items, oldest first. */
  tail(n: number): T[] {
    const out: T[] = [];
    for (let i = Math.max(0, this.count - n); i < this.count; i++) out.push(this.at(i)!);
    return out;
  }

  toArray(): T[] {
    return this.tail(this.count);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

export interface Timestamped {
  /** Milliseconds on the shared clock (performance.now() in the browser). */
  t: number;
}

export interface GazeSample extends Timestamped {
  /** Gaze estimate in normalised screen coordinates (0..1), NaN when unknown. */
  x: number;
  y: number;
  /** Face found and eyes open. */
  valid: boolean;
  blink: boolean;
  /** Head pose in degrees (yaw: left/right, pitch: up/down). */
  yaw: number;
  pitch: number;
}

export interface SpeechSample extends Timestamped {
  /** Next script token the speaker is expected to say. */
  position: number;
  confidence: number;
  offScript: boolean;
  /** Voice activity at this moment. */
  speaking: boolean;
}

export interface FaceSample extends Timestamped {
  /** Face centre in normalised image coordinates and face width as a fraction of the frame. */
  cx: number;
  cy: number;
  scale: number;
  roll: number;
  /** Mean RGB of a cheek patch (0..255), used by the liveness check. */
  skin?: [number, number, number];
  /** Mouth opening ratio, used by the lip fallback and coach. */
  mouthOpen?: number;
}

export interface TimelineEvent extends Timestamped {
  kind: string;
  data?: Record<string, unknown>;
}

export class FusionTimeline {
  readonly gaze = new RingBuffer<GazeSample>(60 * 30);
  readonly speech = new RingBuffer<SpeechSample>(60 * 20);
  readonly face = new RingBuffer<FaceSample>(60 * 30);
  readonly events: TimelineEvent[] = [];

  /** Samples from `buffer` with t >= since, oldest first. */
  static since<T extends Timestamped>(buffer: RingBuffer<T>, since: number): T[] {
    const out: T[] = [];
    for (let i = buffer.size - 1; i >= 0; i--) {
      const item = buffer.at(i)!;
      if (item.t < since) break;
      out.push(item);
    }
    return out.reverse();
  }

  emit(kind: string, t: number, data?: Record<string, unknown>): void {
    this.events.push(data ? { kind, t, data } : { kind, t });
  }
}
