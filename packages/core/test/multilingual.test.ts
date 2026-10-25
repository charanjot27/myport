import { describe, expect, it } from "vitest";
import { crossKey, detectScriptLanguage, parseScript, ReadingPace, ScriptAligner, spokenUnits, transliterate } from "../src/index.js";

/** Feed a transcript word by word as interim results, then as a final, like a recogniser does. */
function speak(aligner: ScriptAligner, text: string): number {
  const words = text.split(" ");
  let pos = 0;
  for (let i = 1; i <= words.length; i++) pos = aligner.update(words.slice(0, i).join(" "), false, i * 300).position;
  return Math.max(pos, aligner.update(text, true, words.length * 300).position);
}

describe("Indic transliteration", () => {
  it("romanises Devanagari and Gurmukhi with schwa deletion", () => {
    expect(transliterate("नमस्ते")).toBe("namaste");
    expect(transliterate("कमल")).toBe("kamal");
    expect(transliterate("ज़िंदगी")).toBe("zindagii");
    expect(transliterate("ਪੰਜਾਬੀ")).toBe("panjaabii");
    expect(transliterate("ਉਹ")).toBe("uh");
    expect(transliterate("hello")).toBe("hello");
  });

  it("gives Latin, Devanagari and Gurmukhi spellings of a word the same key", () => {
    expect(crossKey("मीटिंग")).toBe(crossKey("meeting"));
    expect(crossKey("ਮੀਟਿੰਗ")).toBe(crossKey("meeting"));
    expect(crossKey("आप")).toBe(crossKey("aap"));
    expect(crossKey("कैसे")).toBe(crossKey("kaise"));
    expect(crossKey("kese")).toBe(crossKey("kaise"));
    expect(crossKey("ठीक")).toBe(crossKey("theek"));
    expect(crossKey("ਪੰਜਾਬੀ")).toBe(crossKey("punjabi"));
    expect(crossKey("का")).not.toBe(crossKey("की"));
  });

  it("reads Indic digits and number words as numbers", () => {
    expect(spokenUnits("१०")).toEqual(["ten"]);
    expect(spokenUnits("੨੫")).toEqual(["twenty", "five"]);
    expect(spokenUnits("दस")).toEqual(["ten"]);
    expect(spokenUnits("ਪੰਜ")).toEqual(["five"]);
  });

  it("detects the script language", () => {
    expect(detectScriptLanguage("ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ, ਅੱਜ ਦੀ meeting ਵਿੱਚ")).toBe("pa");
    expect(detectScriptLanguage("नमस्ते दोस्तों, आज हम बात करेंगे")).toBe("hi");
    expect(detectScriptLanguage("Hello everyone, aaj hum baat karenge")).toBe("latin");
  });

  it("ends sentences at a danda", () => {
    const s = parseScript("यह पहला वाक्य है। यह दूसरा है।");
    expect(s.sentenceCount).toBe(2);
    expect(s.words[3]!.sentenceEnd).toBe(true);
  });
});

describe("multilingual alignment", () => {
  it("follows a Hinglish script typed in Latin while Hindi recognition writes Devanagari", () => {
    const script = parseScript("Namaste doston. Aap kaise ho? Main theek hoon. Aaj hum meeting ke baare mein baat karenge.");
    const a = new ScriptAligner(script);
    speak(a, "नमस्ते दोस्तों आप कैसे हो");
    expect(a.currentPosition).toBe(5);
    expect(speak(a, "मैं ठीक हूं आज हम मीटिंग के बारे में बात करेंगे")).toBe(script.tokens.length);
  });

  it("follows a Devanagari script when English words come back in Latin", () => {
    const script = parseScript("आज की मीटिंग में हम नए प्रोजेक्ट के बारे में बात करेंगे");
    const a = new ScriptAligner(script);
    expect(speak(a, "आज की meeting में हम नए project के बारे में बात करेंगे")).toBe(script.tokens.length);
  });

  it("follows a Punjabi (Gurmukhi) script with English mixed in", () => {
    const script = parseScript("ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ। ਅੱਜ ਦੀ meeting ਵਿੱਚ ਅਸੀਂ ਨਵੇਂ project ਬਾਰੇ ਗੱਲ ਕਰਾਂਗੇ।");
    const a = new ScriptAligner(script);
    speak(a, "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ ਅੱਜ ਦੀ ਮੀਟਿੰਗ ਵਿੱਚ");
    expect(a.currentPosition).toBe(8);
    expect(speak(a, "ਅਸੀਂ ਨਵੇਂ ਪ੍ਰੋਜੈਕਟ ਬਾਰੇ ਗੱਲ ਕਰਾਂਗੇ")).toBe(script.tokens.length);
  });

  it("skips Hindi hesitations", () => {
    const script = parseScript("हम आज बात करेंगे");
    const a = new ScriptAligner(script);
    expect(speak(a, "हम उम्म आज अ बात करेंगे")).toBe(script.tokens.length);
  });
});

describe("ReadingPace", () => {
  it("glides at the speaker's pace, never far past what was heard, and holds in silence", () => {
    const p = new ReadingPace({ lead: 1, initialRate: 2 });
    p.confirm(0, 0);
    p.confirm(4, 1000); // 4 words/s
    expect(p.rate).toBeGreaterThan(2);
    let last = p.position;
    for (let t = 0; t < 2000; t += 16) {
      const pos = p.step(16, true);
      expect(pos).toBeGreaterThanOrEqual(last); // monotonic, no steps backwards
      expect(pos - last).toBeLessThan(0.5); // no jumps
      last = pos;
    }
    expect(last).toBeGreaterThan(4.5);
    expect(last).toBeLessThanOrEqual(5);
    const held = p.position;
    for (let t = 0; t < 1000; t += 16) p.step(16, false);
    expect(p.position).toBe(held);
  });

  it("follows a re-read immediately", () => {
    const p = new ReadingPace();
    p.confirm(20, 0);
    for (let t = 0; t < 2000; t += 16) p.step(16, true);
    p.confirm(5, 2100);
    expect(p.position).toBe(5);
  });
});
