import type { TokenTiming } from "../align/aligner.js";
import type { FaceSample, GazeSample, TimelineEvent } from "../fusion/timeline.js";

/**
 * Everything recorded about one prompting session. Only derived signals are
 * stored, never video or audio. The same record is the unit of the research
 * dataset (with consent) and the input to the coach report.
 */
export interface SessionRecord {
  version: 1;
  id: string;
  scriptId: string;
  scriptTitle: string;
  /** Script source at the time of the session, so the record is self-contained. */
  scriptSource: string;
  startedAt: string;
  durationMs: number;
  tokenTimings: TokenTiming[];
  transcript: Array<{ t: number; text: string; isFinal: boolean }>;
  alignment: Array<{ t: number; position: number; confidence: number; offScript: boolean; jumped: boolean }>;
  gaze: GazeSample[];
  face: FaceSample[];
  stumbleRisk: Array<{ t: number; risk: number; warning: boolean }>;
  /** Per-frame stumble features (research mode only). */
  features?: Array<{ t: number; f: number[] }>;
  /** Hand motion energy per frame, for fidget detection. */
  handMotion?: Array<{ t: number; energy: number }>;
  events: TimelineEvent[];
  /** Stumbles detected automatically when the session ended (weak labels for training). */
  autoStumbles?: Array<{ t: number; kind: StumbleKind; token: number }>;
  /** Manual labels added in the labelling tool. */
  labels?: Array<{ t: number; kind: StumbleKind | "none"; token?: number; note?: string }>;
  meta?: Record<string, unknown>;
}

export type StumbleKind = "restart" | "hesitation" | "filler" | "misread";

/** Downsample a timestamped series to at most `hz` samples per second. */
export function downsample<T extends { t: number }>(items: T[], hz: number): T[] {
  const step = 1000 / hz;
  const out: T[] = [];
  let next = -Infinity;
  for (const it of items) {
    if (it.t >= next) {
      out.push(it);
      next = it.t + step;
    }
  }
  return out;
}
