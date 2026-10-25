/**
 * Heuristic per-word reading difficulty in [0, 1]. Used as an input feature by
 * the stumble predictor and to decide which words to pre-highlight.
 */

/** Very common English words; these are almost never the cause of a stumble. */
const COMMON = new Set(
  (
    "a about after all also an and any are as at be because been but by can come could day do " +
    "even first for from get give go good have he her here him his how i if in into is it its " +
    "just know like look make me more most my new no not now of on one only or other our out " +
    "over people say see she so some take than that the their them then there these they think " +
    "this time to two up us use very want was way we well what when which who will with work " +
    "would year you your am did does got had has let may much must off own right same should " +
    "still such tell thing those through too under until upon was were where while why yes yet " +
    "back down many need never next part place put really show small something start three today " +
    "very why world life last long great little old big high different following end around " +
    "every few going another every each both between being made used found again"
  ).split(" "),
);

/** Rough syllable count for Latin-script words. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return Math.max(1, Math.round([...word].length / 3));
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export interface DifficultyInput {
  /** The word as displayed (keeps capitalisation and punctuation). */
  display: string;
  /** Normalised form. */
  norm: string;
  /** True if this word is the first in its sentence. */
  sentenceStart: boolean;
}

export function wordDifficulty({ display, norm, sentenceStart }: DifficultyInput): number {
  if (!norm) return 0;
  if (COMMON.has(norm)) return 0.05;
  const syl = syllables(norm);
  const len = [...norm].length;
  let d = 0;
  d += Math.min(0.45, (syl - 1) * 0.12);
  d += Math.min(0.2, Math.max(0, len - 6) * 0.03);
  if (/\d/.test(display)) d += 0.25; // numbers are read with more effort
  if (!sentenceStart && /^\p{Lu}/u.test(display)) d += 0.15; // proper nouns
  if (/^\p{Lu}{2,}$/u.test(display.replace(/[^\p{L}]/gu, ""))) d += 0.2; // acronyms
  if (/\p{Script=Latin}/u.test(display) && /[^\p{Script=Latin}\p{N}\p{P}\p{M}]/u.test(display)) d += 0.1; // mixed scripts in one word
  // Consonant clusters ("strengths") are tongue twisters.
  if (/[bcdfghjklmnpqrstvwxz]{4,}/.test(norm)) d += 0.15;
  return Math.max(0, Math.min(1, d + 0.1));
}
