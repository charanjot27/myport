import { describe, expect, it } from "vitest";
import { ScriptAligner } from "../src/align/aligner.js";
import { parseScript } from "../src/text/script.js";

const SCRIPT = parseScript(`
# Intro
Good morning everyone and thank you for joining this session about predictive teleprompting.
Most teleprompters scroll at a fixed speed or follow your speech only after you say a word.

# Method
We track where your eyes are on the script and where your voice is at the same time.
When the gap between them shrinks a stumble is usually about to happen.

# Close
Thank you for listening and I am happy to take your questions now.
`);

/** Simulate a recogniser that emits growing interim results and then a final. */
function speak(aligner: ScriptAligner, sentence: string, t0 = 0) {
  const words = sentence.split(" ");
  let last;
  for (let i = 1; i <= words.length; i++) {
    last = aligner.update(words.slice(0, i).join(" "), false, t0 + i * 300);
  }
  last = aligner.update(sentence, true, t0 + words.length * 300);
  return last!;
}

const tokenOf = (display: string, nth = 0) =>
  SCRIPT.words.filter((w) => w.display.replace(/[.,]/g, "") === display)[nth]!.tokenStart;

describe("ScriptAligner", () => {
  it("follows straight reading word by word", () => {
    const a = new ScriptAligner(SCRIPT);
    const r = speak(a, "good morning everyone and thank you for joining");
    expect(r.position).toBe(tokenOf("joining") + 1);
    expect(r.offScript).toBe(false);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("tolerates recogniser errors, homophones and dropped short words", () => {
    const a = new ScriptAligner(SCRIPT);
    speak(a, "good morning everyone and thank you for joining this session");
    const r = speak(a, "about predictive tele prompting most tele prompters scroll at fixed speed");
    expect(r.position).toBeGreaterThanOrEqual(tokenOf("speed") - 1);
    expect(r.position).toBeLessThanOrEqual(tokenOf("speed") + 1);
  });

  it("ignores fillers and short ad-libs", () => {
    const a = new ScriptAligner(SCRIPT);
    speak(a, "good morning everyone um and uh thank you so much for joining");
    expect(a.currentPosition).toBe(tokenOf("joining") + 1);
  });

  it("flags off-script speech without moving", () => {
    const a = new ScriptAligner(SCRIPT);
    speak(a, "good morning everyone");
    const before = a.currentPosition;
    const r = speak(a, "sorry my cat just walked across the keyboard");
    expect(r.offScript).toBe(true);
    expect(a.currentPosition).toBe(before);
  });

  it("follows a skip to a later section once confirmed", () => {
    const a = new ScriptAligner(SCRIPT);
    speak(a, "good morning everyone and thank you for joining this session");
    const r = speak(a, "when the gap between them shrinks a stumble is usually about to happen");
    expect(r.position).toBe(tokenOf("happen") + 1);
  });

  it("handles a restart of the current sentence", () => {
    const a = new ScriptAligner(SCRIPT);
    speak(a, "good morning everyone and thank you for joining this session about predictive");
    const r = speak(a, "thank you for joining this");
    expect(r.position).toBe(tokenOf("this") + 1);
  });

  it("records timings for finalised tokens and reports completion", () => {
    const a = new ScriptAligner(SCRIPT);
    a.seek(tokenOf("Thank"));
    const r = speak(a, "thank you for listening and i am happy to take your questions now", 10_000);
    expect(r.finished).toBe(true);
    const timings = a.tokenTimings();
    expect(timings.length).toBeGreaterThan(10);
    expect(timings.every((x) => x.t >= 10_000)).toBe(true);
  });
});
