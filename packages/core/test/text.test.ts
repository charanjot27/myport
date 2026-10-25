import { describe, expect, it } from "vitest";
import { normalizeTranscript, numberToWords, spokenUnits } from "../src/text/normalize.js";
import { phoneticKey } from "../src/text/phonetic.js";
import { parseScript } from "../src/text/script.js";
import { syllables, wordDifficulty } from "../src/text/difficulty.js";

describe("normalisation", () => {
  it("spells numbers", () => {
    expect(numberToWords(0)).toEqual(["zero"]);
    expect(numberToWords(42)).toEqual(["forty", "two"]);
    expect(numberToWords(1_250_000)).toEqual(["one", "million", "two", "hundred", "fifty", "thousand"]);
  });

  it("expands symbols, years, decimals and currency", () => {
    expect(spokenUnits("10%")).toEqual(["ten", "percent"]);
    expect(spokenUnits("1999")).toEqual(["nineteen", "ninety", "nine"]);
    expect(spokenUnits("2005")).toEqual(["two", "thousand", "five"]);
    expect(spokenUnits("3.14")).toEqual(["three", "point", "one", "four"]);
    expect(spokenUnits("$5")).toEqual(["five", "dollars"]);
    expect(spokenUnits("well-known")).toEqual(["well", "known"]);
    expect(spokenUnits("Don't,")).toEqual(["dont"]);
  });

  it("keeps non-Latin scripts", () => {
    expect(spokenUnits("नमस्ते।")).toEqual(["नमस्ते"]);
    expect(normalizeTranscript("Hello  World")).toEqual(["hello", "world"]);
  });
});

describe("phonetic key", () => {
  it("maps common homophones together", () => {
    expect(phoneticKey("their")).toBe(phoneticKey("there"));
    expect(phoneticKey("knight")).toBe(phoneticKey("night"));
    expect(phoneticKey("to")).toBe(phoneticKey("two"));
    expect(phoneticKey("phone")).toBe(phoneticKey("fone"));
    expect(phoneticKey("cat")).not.toBe(phoneticKey("dog"));
  });
});

describe("difficulty", () => {
  it("counts syllables roughly", () => {
    expect(syllables("cat")).toBe(1);
    expect(syllables("teleprompter")).toBeGreaterThanOrEqual(3);
  });
  it("rates long, rare words harder than common ones", () => {
    const easy = wordDifficulty({ display: "the", norm: "the", sentenceStart: false });
    const hard = wordDifficulty({ display: "psycholinguistics", norm: "psycholinguistics", sentenceStart: false });
    expect(hard).toBeGreaterThan(easy + 0.3);
  });
});

describe("parseScript", () => {
  const src = `Welcome everyone.

# Part one
Today we talk about *eye voice span* [pause] and 10% gains.
Next sentence here!

# Part two
Thanks.`;
  const s = parseScript(src);

  it("builds sections with word ranges", () => {
    expect(s.sections.map((x) => x.title)).toEqual(["", "Part one", "Part two"]);
    expect(s.sections[0]).toMatchObject({ wordStart: 0, wordEnd: 2 });
    expect(s.words[s.sections[2]!.wordStart]!.display).toBe("Thanks.");
  });

  it("strips cues and emphasis but records them", () => {
    const and = s.words.find((w) => w.display === "and")!;
    expect(and.cues).toEqual(["pause"]);
    expect(s.words.filter((w) => w.emphasis).map((w) => w.display)).toEqual(["eye", "voice", "span"]);
    expect(s.words.some((w) => w.display.includes("["))).toBe(false);
  });

  it("maps display words to spoken tokens", () => {
    const pct = s.words.find((w) => w.display === "10%")!;
    expect(s.tokens.slice(pct.tokenStart, pct.tokenEnd).map((t) => t.norm)).toEqual(["ten", "percent"]);
  });

  it("tracks sentences and character offsets", () => {
    expect(s.words[0]!.sentenceStart).toBe(true);
    expect(s.words[1]!.sentenceEnd).toBe(true);
    const w = s.words.find((x) => x.display === "Today")!;
    expect(src.slice(w.charStart, w.charEnd)).toBe("Today");
    expect(s.sentenceCount).toBe(4);
  });
});
