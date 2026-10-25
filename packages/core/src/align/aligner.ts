import { editDistance, normalizeTranscript } from "../text/normalize.js";
import { crossKey, hasIndic } from "../text/indic.js";
import { phoneticKey } from "../text/phonetic.js";
import type { ParsedScript, ScriptToken } from "../text/script.js";

/**
 * Streaming alignment of recognised speech against a known script.
 *
 * Every time the recogniser emits a hypothesis we take the last few spoken
 * units and run a semi-global alignment (Smith–Waterman style, free start and
 * end in the script, hypothesis gaps allowed) against a window of the script
 * around the current position. The end cell of the best path tells us which
 * script token was spoken last. A distance penalty keeps us near the expected
 * position; large jumps need confirmation from consecutive updates.
 */

export interface AlignerOptions {
  /** How many tokens behind the current position to search (re-reads, restarts). */
  lookBehind: number;
  /** How many tokens ahead to search (skipped lines). */
  lookAhead: number;
  /** Number of most recent hypothesis units used per alignment. */
  hypothesisWindow: number;
  /** Below this confidence the speaker is considered off-script. */
  offScriptThreshold: number;
  /** Jumps longer than this (tokens) must be confirmed by a second update. */
  jumpConfirmTokens: number;
  /** Penalty per token of distance from the expected position. */
  distancePenalty: number;
}

export const DEFAULT_ALIGNER_OPTIONS: AlignerOptions = {
  lookBehind: 30,
  lookAhead: 80,
  hypothesisWindow: 8,
  offScriptThreshold: 0.35,
  jumpConfirmTokens: 18,
  distancePenalty: 0.012,
};

export interface AlignmentUpdate {
  /** Index of the next token the speaker is expected to say. */
  position: number;
  /** Last script token matched by speech, or -1 if none yet. */
  lastMatched: number;
  /** 0..1 quality of the latest match. */
  confidence: number;
  offScript: boolean;
  /** True if this update moved the position by more than `jumpConfirmTokens`. */
  jumped: boolean;
  /** True when the final script token has been spoken. */
  finished: boolean;
}

export interface TokenTiming {
  token: number;
  /** Time (ms, caller's clock) the token was first matched. */
  t: number;
}

const MATCH_EXACT = 1.0;
const MATCH_PHONETIC = 0.8;
const MISMATCH = -0.6;
const GAP_HYP = -0.45; // a spoken word not in the script (ad-lib, filler)
const GAP_SCRIPT = -0.35; // a script word the recogniser missed
const GAP_SCRIPT_SHORT = -0.12; // short words are frequently dropped by ASR

const FILLERS = new Set([
  "um", "uh", "erm", "er", "ah", "hmm", "mm", "uhm", "umm",
  // Hindi / Punjabi hesitations as recognisers write them
  "अ", "आ", "उम", "उम्म", "हम्म", "अम्म", "ਅ", "ਹਮ", "ਉਮ",
]);

interface HypUnit {
  norm: string;
  phon: string;
  cross: string;
  /** The final unit of an interim hypothesis may be a truncated word. */
  partial: boolean;
}

export function wordSimilarity(h: HypUnit, s: ScriptToken): number {
  if (h.norm === s.norm) return MATCH_EXACT;
  if (h.phon && h.phon === s.phon && h.phon.length > 1) return MATCH_PHONETIC;
  // Same word heard in another script ("मीटिंग" for "meeting", "aap" for "आप").
  if (h.cross && h.cross === s.cross && h.cross.length > 1) return MATCH_PHONETIC;
  if (h.partial && h.norm.length >= 2 && s.norm.startsWith(h.norm)) return 0.6;
  if (h.partial && h.cross.length >= 2 && s.cross.startsWith(h.cross)) return 0.5;
  const maxLen = Math.max(h.norm.length, s.norm.length);
  if (maxLen >= 4) {
    const allowed = Math.floor(maxLen / 3);
    const d = editDistance(h.norm, s.norm, allowed);
    if (d <= allowed) return 0.7 * (1 - d / maxLen);
  }
  if (hasIndic(h.norm) || hasIndic(s.norm)) {
    const crossLen = Math.max(h.cross.length, s.cross.length);
    if (crossLen >= 3) {
      const allowed = Math.floor(crossLen / 3);
      const d = editDistance(h.cross, s.cross, allowed);
      if (d <= allowed) return 0.6 * (1 - d / crossLen);
    }
  }
  return MISMATCH;
}

export class ScriptAligner {
  readonly options: AlignerOptions;
  private readonly tokens: ScriptToken[];
  private finalUnits: HypUnit[] = [];
  private position = 0;
  private lastMatched = -1;
  private pendingJump: { target: number; count: number } | null = null;
  private readonly timings = new Map<number, number>();

  constructor(
    private readonly script: ParsedScript,
    options: Partial<AlignerOptions> = {},
  ) {
    this.options = { ...DEFAULT_ALIGNER_OPTIONS, ...options };
    this.tokens = script.tokens;
  }

  get currentPosition(): number {
    return this.position;
  }

  /** Move the cursor manually (keyboard, gesture, clicking a word). */
  seek(tokenIndex: number): void {
    this.position = Math.max(0, Math.min(this.tokens.length, tokenIndex));
    this.lastMatched = this.position - 1;
    this.finalUnits = [];
    this.pendingJump = null;
  }

  /** Word timings committed so far, ordered by token. */
  tokenTimings(): TokenTiming[] {
    return [...this.timings.entries()].sort((a, b) => a[0] - b[0]).map(([token, t]) => ({ token, t }));
  }

  /**
   * Feed a recogniser hypothesis.
   * @param text   The text of the current utterance (interim) or a finalised segment.
   * @param isFinal True when the recogniser will not revise this text again.
   * @param t      Timestamp in ms for timing bookkeeping.
   */
  update(text: string, isFinal: boolean, t = 0): AlignmentUpdate {
    const units = toUnits(text, !isFinal);
    const hyp = [...this.finalUnits, ...units].slice(-this.options.hypothesisWindow);
    if (isFinal) {
      this.finalUnits.push(...units.map((u) => ({ ...u, partial: false })));
      if (this.finalUnits.length > 64) this.finalUnits.splice(0, this.finalUnits.length - 64);
    }

    if (!hyp.length || !this.tokens.length) return this.snapshot(1, false);

    const result = this.align(hyp);
    if (!result) return this.snapshot(0, false);

    const { end, confidence, matchedSpan } = result;
    const target = end + 1;
    const distance = target - this.position;
    let jumped = false;

    if (confidence < this.options.offScriptThreshold) {
      this.pendingJump = null;
      return this.snapshot(confidence, false, true);
    }

    if (Math.abs(distance) > this.options.jumpConfirmTokens) {
      // Large jumps need two agreeing hypotheses, unless the match is very strong.
      const strong = confidence > 0.8 && matchedSpan >= 4;
      if (!strong) {
        if (this.pendingJump && Math.abs(this.pendingJump.target - target) <= 3) {
          this.pendingJump.count++;
        } else {
          this.pendingJump = { target, count: 1 };
        }
        if (this.pendingJump.count < 2) return this.snapshot(confidence, false);
      }
      jumped = true;
    }
    this.pendingJump = null;

    // Small backward moves from interim churn are ignored; real restarts are
    // long matches that end well behind the cursor.
    if (distance < 0 && distance > -3 && !isFinal) return this.snapshot(confidence, false);

    this.position = target;
    this.lastMatched = end;
    // Interim results arrive sooner than finals, so they give better timings.
    for (let i = Math.max(0, end - matchedSpan + 1); i <= end; i++) {
      if (!this.timings.has(i)) this.timings.set(i, t);
    }
    return this.snapshot(confidence, jumped);
  }

  private snapshot(confidence: number, jumped: boolean, offScript = false): AlignmentUpdate {
    return {
      position: this.position,
      lastMatched: this.lastMatched,
      confidence,
      offScript,
      jumped,
      finished: this.position >= this.tokens.length,
    };
  }

  private align(hyp: HypUnit[]): { end: number; confidence: number; matchedSpan: number } | null {
    const { lookBehind, lookAhead, distancePenalty } = this.options;
    const lo = Math.max(0, this.position - lookBehind);
    const hi = Math.min(this.tokens.length, this.position + lookAhead);
    const window = this.tokens.slice(lo, hi);
    const n = hyp.length;
    const m = window.length;
    if (!m) return null;

    // score[i][j]: best alignment of hyp[0..i) ending at script window[0..j)
    // Free start in the script (row 0 is zero), hypothesis must be consumed
    // (a leading hyp prefix can be skipped at GAP_HYP each, column 0).
    const score: Float64Array[] = [];
    const span: Int32Array[] = []; // number of matched script tokens on the path
    for (let i = 0; i <= n; i++) {
      score.push(new Float64Array(m + 1));
      span.push(new Int32Array(m + 1));
    }
    for (let i = 1; i <= n; i++) score[i]![0] = score[i - 1]![0]! + (FILLERS.has(hyp[i - 1]!.norm) ? 0 : GAP_HYP * 0.5);

    for (let i = 1; i <= n; i++) {
      const h = hyp[i - 1]!;
      const filler = FILLERS.has(h.norm);
      const rowPrev = score[i - 1]!;
      const row = score[i]!;
      const spanPrev = span[i - 1]!;
      const spanRow = span[i]!;
      for (let j = 1; j <= m; j++) {
        const s = window[j - 1]!;
        const diag = rowPrev[j - 1]! + wordSimilarity(h, s);
        const up = rowPrev[j]! + (filler ? 0 : GAP_HYP);
        const left = row[j - 1]! + (s.norm.length <= 3 ? GAP_SCRIPT_SHORT : GAP_SCRIPT);
        if (diag >= up && diag >= left) {
          row[j] = diag;
          spanRow[j] = spanPrev[j - 1]! + (diag - rowPrev[j - 1]! > 0 ? 1 : 0);
        } else if (up >= left) {
          row[j] = up;
          spanRow[j] = spanPrev[j]!;
        } else {
          row[j] = left;
          spanRow[j] = spanRow[j - 1]!;
        }
      }
    }

    const spoken = hyp.filter((h) => !FILLERS.has(h.norm)).length || 1;
    let best = -Infinity;
    let bestJ = -1;
    const last = score[n]!;
    for (let j = 1; j <= m; j++) {
      const tokenIndex = lo + j - 1;
      const dist = tokenIndex + 1 - this.position;
      // Going backwards is less likely than going forwards.
      const penalty = distancePenalty * (dist >= 0 ? dist : -dist * 1.5);
      const v = last[j]! - penalty;
      if (v > best) {
        best = v;
        bestJ = j;
      }
    }
    if (bestJ < 0) return null;
    const raw = last[bestJ]!;
    const confidence = Math.max(0, Math.min(1, raw / spoken));
    return { end: lo + bestJ - 1, confidence, matchedSpan: span[n]![bestJ]! };
  }
}

function toUnits(text: string, interim: boolean): HypUnit[] {
  const norms = normalizeTranscript(text);
  return norms.map((norm, i) => ({
    norm,
    phon: phoneticKey(norm),
    cross: crossKey(norm),
    partial: interim && i === norms.length - 1,
  }));
}
