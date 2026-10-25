import { normalizeTranscript } from "../text/normalize.js";
import { parseScript, type ParsedScript } from "../text/script.js";
import type { SessionRecord, StumbleKind } from "./session.js";

export interface StumbleEvent {
  t: number;
  kind: StumbleKind;
  /** Script token where it happened. */
  token: number;
  word: string;
}

export interface CoachReport {
  durationSec: number;
  wordsSpoken: number;
  coverage: number;
  wpm: number;
  wpmTimeline: Array<{ t: number; wpm: number }>;
  fillers: { count: number; perMinute: number; top: Array<{ word: string; count: number }> };
  pauses: Array<{ t: number; durationSec: number; token: number }>;
  stumbles: StumbleEvent[];
  prediction: { warnings: number; hits: number; recall: number | null; precision: number | null; meanLeadSec: number | null };
  eyeContactPct: number | null;
  lookAways: number;
  posture: { tiltDeg: number; slouch: number; score: number } | null;
  fidget: { headJitter: number; handEnergy: number | null; score: number } | null;
  offScriptPct: number;
  score: number;
  tips: string[];
}

const FILLER_WORDS = new Set(["um", "uh", "erm", "er", "ah", "uhm", "umm", "hmm", "like", "basically", "actually", "literally"]);
/** Single-word fillers that are also normal words only count when not in the script at that point. */
const AMBIGUOUS_FILLERS = new Set(["like", "basically", "actually", "literally"]);

/**
 * Detect stumbles after the fact from alignment and timing. These are the
 * ground-truth candidates used both in the report and to pre-label research
 * data (a human confirms them in the labelling tool).
 */
export function detectStumbles(record: SessionRecord, script: ParsedScript = parseScript(record.scriptSource)): StumbleEvent[] {
  const out: StumbleEvent[] = [];
  const wordFor = (token: number) => {
    const w = script.tokens[Math.max(0, Math.min(script.tokens.length - 1, token))];
    return w ? script.words[w.wordIndex]?.display ?? "" : "";
  };

  // Restarts: the aligner moved backwards over already-spoken text.
  let maxPos = 0;
  for (const a of record.alignment) {
    if (a.offScript) continue;
    if (a.position < maxPos - 1 && maxPos - a.position <= 25) {
      out.push({ t: a.t, kind: "restart", token: a.position, word: wordFor(a.position) });
    }
    maxPos = Math.max(maxPos, a.position);
  }

  // Hesitations: long gaps between consecutive words that are not at a natural break.
  const timings = [...record.tokenTimings].sort((a, b) => a.token - b.token);
  for (let i = 1; i < timings.length; i++) {
    const prev = timings[i - 1]!;
    const cur = timings[i]!;
    if (cur.token !== prev.token + 1) continue;
    const gap = cur.t - prev.t;
    const prevWord = script.words[script.tokens[prev.token]?.wordIndex ?? -1];
    const curWord = script.words[script.tokens[cur.token]?.wordIndex ?? -1];
    const natural = prevWord?.sentenceEnd || (curWord?.cues.length ?? 0) > 0 || /[,;:—–]$/.test(prevWord?.display ?? "");
    if (!natural && gap > 900 && gap < 8000) {
      out.push({ t: prev.t, kind: "hesitation", token: cur.token, word: wordFor(cur.token) });
    }
  }

  // Fillers inside a sentence (from final transcript segments).
  let lastPosition = 0;
  let ai = 0;
  const alignment = record.alignment;
  for (const seg of record.transcript) {
    if (!seg.isFinal) continue;
    while (ai < alignment.length && alignment[ai]!.t <= seg.t) lastPosition = alignment[ai++]!.position;
    for (const w of normalizeTranscript(seg.text)) {
      if (FILLER_WORDS.has(w) && !AMBIGUOUS_FILLERS.has(w)) {
        out.push({ t: seg.t, kind: "filler", token: lastPosition, word: w });
      }
    }
  }

  out.sort((a, b) => a.t - b.t);
  // Merge events closer than 1.5 s: one stumble often produces a filler, a pause and a restart.
  const merged: StumbleEvent[] = [];
  for (const e of out) {
    const last = merged[merged.length - 1];
    if (last && e.t - last.t < 1500) continue;
    merged.push(e);
  }
  return merged;
}

export function buildReport(record: SessionRecord): CoachReport {
  const script = parseScript(record.scriptSource);
  const durationSec = Math.max(1, record.durationMs / 1000);
  const spokenTokens = new Set(record.tokenTimings.map((x) => x.token));
  const spokenWords = new Set([...spokenTokens].map((t) => script.tokens[t]?.wordIndex).filter((x) => x !== undefined));
  const wordsSpoken = spokenWords.size;

  // Pace from word timings, in 15 s buckets.
  const wordTimes = [...spokenWords]
    .map((w) => {
      const tok = script.words[w!]!.tokenStart;
      return record.tokenTimings.find((x) => x.token === tok)?.t;
    })
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);
  const speakingSpan = wordTimes.length > 1 ? (wordTimes[wordTimes.length - 1]! - wordTimes[0]!) / 60000 : 0;
  const wpm = speakingSpan > 0 ? Math.round(wordTimes.length / speakingSpan) : 0;
  const wpmTimeline: Array<{ t: number; wpm: number }> = [];
  const bucketMs = 15000;
  for (let b = 0; b * bucketMs < record.durationMs; b++) {
    const lo = b * bucketMs;
    const n = wordTimes.filter((t) => t >= lo && t < lo + bucketMs).length;
    wpmTimeline.push({ t: lo, wpm: Math.round(n * (60000 / bucketMs)) });
  }

  // Fillers.
  const fillerCounts = new Map<string, number>();
  for (const seg of record.transcript) {
    if (!seg.isFinal) continue;
    for (const w of normalizeTranscript(seg.text)) {
      if (FILLER_WORDS.has(w) && !AMBIGUOUS_FILLERS.has(w)) fillerCounts.set(w, (fillerCounts.get(w) ?? 0) + 1);
    }
  }
  const fillerCount = [...fillerCounts.values()].reduce((a, b) => a + b, 0);

  // Long pauses (≥ 2 s between words).
  const pauses: CoachReport["pauses"] = [];
  const timings = [...record.tokenTimings].sort((a, b) => a.t - b.t);
  for (let i = 1; i < timings.length; i++) {
    const gap = timings[i]!.t - timings[i - 1]!.t;
    if (gap >= 2000) pauses.push({ t: timings[i - 1]!.t, durationSec: gap / 1000, token: timings[i]!.token });
  }

  const stumbles = detectStumbles(record, script);

  // How well did the live predictor anticipate the detected stumbles?
  const warningStarts: number[] = [];
  let prevWarn = false;
  for (const r of record.stumbleRisk) {
    if (r.warning && !prevWarn) warningStarts.push(r.t);
    prevWarn = r.warning;
  }
  const leads: number[] = [];
  let hitWarnings = 0;
  for (const s of stumbles) {
    const w = warningStarts.filter((t) => t <= s.t - 300 && t >= s.t - 2500);
    if (w.length) leads.push((s.t - Math.max(...w)) / 1000);
  }
  for (const w of warningStarts) if (stumbles.some((s) => s.t - w >= 300 && s.t - w <= 2500)) hitWarnings++;

  // Eye contact and look-aways from head pose.
  const gaze = record.gaze;
  let eyeContactPct: number | null = null;
  let lookAways = 0;
  if (gaze.length) {
    const facing = gaze.filter((g) => g.valid && Math.abs(g.yaw) < 15 && Math.abs(g.pitch) < 15);
    eyeContactPct = Math.round((facing.length / gaze.length) * 100);
    let awaySince: number | null = null;
    for (const g of gaze) {
      const away = !g.valid || Math.abs(g.yaw) >= 25;
      if (away && awaySince === null) awaySince = g.t;
      if (!away && awaySince !== null) {
        if (g.t - awaySince > 1000) lookAways++;
        awaySince = null;
      }
    }
  }

  // Posture from face position/scale drift and head roll.
  let posture: CoachReport["posture"] = null;
  let fidget: CoachReport["fidget"] = null;
  const face = record.face;
  if (face.length > 10) {
    const tiltDeg = mean(face.map((f) => Math.abs(f.roll)));
    const q = Math.max(1, Math.floor(face.length / 4));
    const early = face.slice(0, q);
    const late = face.slice(-q);
    // Slouching: the face drifts down and gets closer to the camera.
    const slouch = Math.max(0, mean(late.map((f) => f.cy)) - mean(early.map((f) => f.cy))) * 10 +
      Math.max(0, mean(late.map((f) => f.scale)) / (mean(early.map((f) => f.scale)) || 1) - 1) * 5;
    posture = { tiltDeg, slouch, score: clampScore(100 - tiltDeg * 4 - slouch * 30) };

    const jitter: number[] = [];
    for (let i = 2; i < face.length; i++) {
      // Second difference removes slow drift and keeps quick movements.
      const ddx = face[i]!.cx - 2 * face[i - 1]!.cx + face[i - 2]!.cx;
      const ddy = face[i]!.cy - 2 * face[i - 1]!.cy + face[i - 2]!.cy;
      jitter.push(Math.hypot(ddx, ddy));
    }
    const headJitter = mean(jitter) * 1000;
    const handEnergy = record.handMotion?.length ? mean(record.handMotion.map((h) => h.energy)) : null;
    fidget = { headJitter, handEnergy, score: clampScore(100 - headJitter * 8 - (handEnergy ?? 0) * 40) };
  }

  const offScriptPct = record.alignment.length
    ? Math.round((record.alignment.filter((a) => a.offScript).length / record.alignment.length) * 100)
    : 0;
  const minutes = durationSec / 60;
  const coverage = script.words.length ? wordsSpoken / script.words.length : 0;

  const paceScore = wpm ? clampScore(100 - Math.max(0, Math.abs(wpm - 145) - 15) * 1.5) : 50;
  const fluencyScore = clampScore(100 - (stumbles.length / Math.max(1, minutes)) * 12 - (fillerCount / Math.max(1, minutes)) * 6);
  const parts = [paceScore, fluencyScore];
  if (eyeContactPct !== null) parts.push(eyeContactPct);
  if (posture) parts.push(posture.score);
  if (fidget) parts.push(fidget.score);
  const score = Math.round(mean(parts));

  const tips: string[] = [];
  if (wpm > 175) tips.push(`You averaged ${wpm} words per minute. Aim for 140–160 so listeners can keep up.`);
  else if (wpm && wpm < 115) tips.push(`You averaged ${wpm} words per minute. A little more pace will sound more confident.`);
  if (fillerCount / Math.max(1, minutes) > 3) tips.push("Several filler words. Try a silent pause instead of “um”.");
  if (stumbles.length) {
    const hard = mostCommon(stumbles.map((s) => s.word.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean));
    tips.push(hard ? `Most stumbles were around “${hard}”. Rehearse that line or rephrase it.` : "Rehearse the lines marked on the timeline.");
  }
  if (eyeContactPct !== null && eyeContactPct < 70) tips.push("You often looked away from the camera. Move the prompter window closer to your webcam.");
  if (posture && posture.slouch > 0.5) tips.push("You leaned in or sank down as the session went on. Reset your posture between sections.");
  if (fidget && fidget.score < 60) tips.push("Lots of quick head or hand movement. Try resting your hands between gestures.");
  if (coverage < 0.8 && script.words.length > 20) tips.push(`You covered ${Math.round(coverage * 100)}% of the script.`);
  if (!tips.length) tips.push("Solid delivery. Try a faster section or a harder script next time.");

  return {
    durationSec,
    wordsSpoken,
    coverage,
    wpm,
    wpmTimeline,
    fillers: {
      count: fillerCount,
      perMinute: Math.round((fillerCount / Math.max(1 / 60, minutes)) * 10) / 10,
      top: [...fillerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, count]) => ({ word, count })),
    },
    pauses,
    stumbles,
    prediction: {
      warnings: warningStarts.length,
      hits: hitWarnings,
      recall: stumbles.length ? leads.length / stumbles.length : null,
      precision: warningStarts.length ? hitWarnings / warningStarts.length : null,
      meanLeadSec: leads.length ? mean(leads) : null,
    },
    eyeContactPct,
    lookAways,
    posture,
    fidget,
    offScriptPct,
    score,
    tips,
  };
}

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
function mostCommon(v: string[]): string | null {
  const m = new Map<string, number>();
  for (const x of v) m.set(x, (m.get(x) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of m) if (c > n) [best, n] = [k, c];
  return best;
}
