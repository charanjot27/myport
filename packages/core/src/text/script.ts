import { wordDifficulty } from "./difficulty.js";
import { spokenUnits } from "./normalize.js";
import { crossKey } from "./indic.js";
import { phoneticKey } from "./phonetic.js";

/**
 * Script markup (deliberately tiny so non-technical users can write it):
 *   # Heading          starts a section; the heading itself is not spoken
 *   [pause] [smile]    a cue: shown to the speaker, never spoken
 *   *word* / **word**  emphasis
 *   blank line         paragraph break
 */

export interface ScriptWord {
  index: number;
  /** Text as shown on the prompter, emphasis markers removed. */
  display: string;
  /** Character offsets of the word in the raw script source. */
  charStart: number;
  charEnd: number;
  section: number;
  paragraph: number;
  sentence: number;
  sentenceStart: boolean;
  sentenceEnd: boolean;
  emphasis: boolean;
  /** Cues (stage directions) placed immediately before this word. */
  cues: string[];
  /** Range of spoken tokens [tokenStart, tokenEnd) produced by this word. */
  tokenStart: number;
  tokenEnd: number;
  difficulty: number;
}

export interface ScriptToken {
  index: number;
  norm: string;
  phon: string;
  /** Cross-script sound key (Devanagari, Gurmukhi and Latin spellings agree). */
  cross: string;
  wordIndex: number;
}

export interface ScriptSection {
  index: number;
  title: string;
  wordStart: number;
  wordEnd: number;
}

export interface ParsedScript {
  source: string;
  words: ScriptWord[];
  tokens: ScriptToken[];
  sections: ScriptSection[];
  paragraphCount: number;
  sentenceCount: number;
}

const WORD_OR_CUE = /\[[^\]\n]*\]|[^\s[\]]+/gu;

export function parseScript(source: string): ParsedScript {
  const words: ScriptWord[] = [];
  const tokens: ScriptToken[] = [];
  const sections: ScriptSection[] = [];
  let paragraph = 0;
  let sentence = 0;
  let sentenceStart = true;
  let pendingCues: string[] = [];
  let paragraphHasWords = false;
  let emphasisOpen = false;

  const openSection = (title: string) => {
    const prev = sections[sections.length - 1];
    if (prev) prev.wordEnd = words.length;
    sections.push({ index: sections.length, title, wordStart: words.length, wordEnd: words.length });
  };

  let offset = 0;
  for (const line of source.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      if (paragraphHasWords) {
        paragraph++;
        paragraphHasWords = false;
      }
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/u.exec(trimmed);
    if (heading) {
      if (words.length && sections.length === 0) {
        // Text before the first heading becomes an untitled intro section.
        sections.push({ index: 0, title: "", wordStart: 0, wordEnd: words.length });
      }
      openSection(heading[1]!.trim());
      if (paragraphHasWords) paragraph++;
      paragraphHasWords = false;
      sentenceStart = true;
      continue;
    }

    for (const m of line.matchAll(WORD_OR_CUE)) {
      const raw = m[0];
      const charStart = lineStart + (m.index ?? 0);
      if (raw.startsWith("[")) {
        pendingCues.push(raw.slice(1, -1).trim());
        continue;
      }

      const opensEmphasis = /^\*{1,2}/.test(raw);
      const closesEmphasis = /\*{1,2}[^\p{L}\p{N}]*$/u.test(raw);
      const display = raw.replace(/\*+/g, "");
      const emphasis = emphasisOpen || opensEmphasis;
      if (opensEmphasis && !closesEmphasis) emphasisOpen = true;
      if (closesEmphasis) emphasisOpen = false;

      const units = spokenUnits(display);
      if (!units.length && !/[\p{L}\p{N}]/u.test(display)) {
        // Pure punctuation such as "—"; attach sentence end to previous word.
        if (/[.!?…।॥]/u.test(display) && words.length) {
          words[words.length - 1]!.sentenceEnd = true;
          sentenceStart = true;
          sentence++;
        }
        continue;
      }

      const index = words.length;
      const tokenStart = tokens.length;
      for (const norm of units) {
        tokens.push({ index: tokens.length, norm, phon: phoneticKey(norm), cross: crossKey(norm), wordIndex: index });
      }
      const sentenceEnd = /[.!?…।॥]["'”’)\]]*$/u.test(display);
      words.push({
        index,
        display,
        charStart,
        charEnd: charStart + raw.length,
        section: Math.max(0, sections.length - 1),
        paragraph,
        sentence,
        sentenceStart,
        sentenceEnd,
        emphasis,
        cues: pendingCues,
        tokenStart,
        tokenEnd: tokens.length,
        difficulty: wordDifficulty({ display, norm: units[0] ?? "", sentenceStart }),
      });
      pendingCues = [];
      paragraphHasWords = true;
      sentenceStart = sentenceEnd;
      if (sentenceEnd) sentence++;
    }
  }

  if (sections.length === 0) sections.push({ index: 0, title: "", wordStart: 0, wordEnd: words.length });
  sections[sections.length - 1]!.wordEnd = words.length;

  return {
    source,
    words,
    tokens,
    sections,
    paragraphCount: words.length ? paragraph + (paragraphHasWords ? 1 : 0) : 0,
    sentenceCount: sentence + (sentenceStart ? 0 : 1),
  };
}

/** Index of the word that contains `tokenIndex` (clamped). */
export function wordAtToken(script: ParsedScript, tokenIndex: number): number {
  if (!script.tokens.length) return 0;
  const t = Math.max(0, Math.min(script.tokens.length - 1, tokenIndex));
  return script.tokens[t]!.wordIndex;
}

/** Estimated speaking time in seconds at the given words per minute. */
export function estimateDuration(script: ParsedScript, wpm = 150): number {
  return (script.words.length / wpm) * 60;
}
