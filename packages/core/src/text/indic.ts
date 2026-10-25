/**
 * Indic script support: Devanagari (Hindi, Marathi, Nepali…) and Gurmukhi
 * (Punjabi). Speech recognisers rarely write a word in the same script as the
 * script author: Hindi recognition writes English loanwords in Devanagari
 * ("मीटिंग"), Hinglish scripts are typed in Latin ("aap kaise ho") and
 * Punjabi scripts mix Gurmukhi with English. To compare them we transliterate
 * everything to Latin and reduce it to a coarse sound key.
 */

type Table = Record<string, string>;

const DEVA_VOWELS: Table = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu", "ऋ": "ri", "ॠ": "rii", "ऌ": "li",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऍ": "e", "ऑ": "o", "ऎ": "e", "ऒ": "o",
};
const DEVA_CONSONANTS: Table = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "ऩ": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ऱ": "r", "ल": "l", "ळ": "l", "ऴ": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
};
const DEVA_MATRAS: Table = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri", "ॄ": "rii",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o", "ॆ": "e", "ॊ": "o",
};

const GURU_VOWELS: Table = {
  "ਅ": "a", "ਆ": "aa", "ਇ": "i", "ਈ": "ii", "ਉ": "u", "ਊ": "uu", "ਏ": "e", "ਐ": "ai", "ਓ": "o", "ਔ": "au",
  // Vowel bearers: the vowel comes from the sign that follows.
  "ੳ": "", "ੲ": "",
};
const GURU_CONSONANTS: Table = {
  "ਕ": "k", "ਖ": "kh", "ਗ": "g", "ਘ": "gh", "ਙ": "ng",
  "ਚ": "ch", "ਛ": "chh", "ਜ": "j", "ਝ": "jh", "ਞ": "ny",
  "ਟ": "t", "ਠ": "th", "ਡ": "d", "ਢ": "dh", "ਣ": "n",
  "ਤ": "t", "ਥ": "th", "ਦ": "d", "ਧ": "dh", "ਨ": "n",
  "ਪ": "p", "ਫ": "ph", "ਬ": "b", "ਭ": "bh", "ਮ": "m",
  "ਯ": "y", "ਰ": "r", "ਲ": "l", "ਵ": "v", "ੜ": "r", "ਸ": "s", "ਹ": "h",
  "ਖ਼": "kh", "ਗ਼": "g", "ਜ਼": "z", "ਫ਼": "f", "ਲ਼": "l", "ਸ਼": "sh",
};
const GURU_MATRAS: Table = {
  "ਾ": "aa", "ਿ": "i", "ੀ": "ii", "ੁ": "u", "ੂ": "uu", "ੇ": "e", "ੈ": "ai", "ੋ": "o", "ੌ": "au",
};

/** A nukta turns the preceding consonant into a borrowed (Perso-Arabic or English) sound. */
const NUKTA: Table = { k: "q", kh: "kh", g: "g", j: "z", ph: "f", d: "r", dh: "rh", s: "sh", l: "l", y: "y" };

const CONSONANTS: Table = { ...DEVA_CONSONANTS, ...GURU_CONSONANTS };
const VOWELS: Table = { ...DEVA_VOWELS, ...GURU_VOWELS };
const MATRAS: Table = { ...DEVA_MATRAS, ...GURU_MATRAS };
const VIRAMA = new Set(["्", "੍"]);
const NASAL = new Set(["ं", "ँ", "ੰ", "ਂ"]); // anusvara, chandrabindu, tippi, bindi
const NUKTA_SIGN = new Set(["़", "਼"]);
const VISARGA = new Set(["ः", "ਃ"]);
const ADDAK = "ੱ"; // Gurmukhi gemination: doubles the next consonant
const SKIP = new Set(["ऽ", "ॐ", "ੑ", "ੵ", "‌", "‍"]);

const INDIC = /[ऀ-ॿ਀-੿]/u;

export function hasIndic(s: string): boolean {
  return INDIC.test(s);
}

/** Map Devanagari and Gurmukhi digits to ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[०-९੦-੯]/gu, (d) => String((d.codePointAt(0)! - (d >= "੦" ? 0x0a66 : 0x0966)) % 10));
}

/**
 * Romanise Devanagari/Gurmukhi (simplified ITRANS). Latin and other characters
 * pass through. Characters are expected in NFC or NFKC order.
 */
export function transliterate(input: string): string {
  if (!hasIndic(input)) return input;
  const s = input.normalize("NFC").replace("ੴ", "ik onkar");
  let out = "";
  let pendingA = false; // inherent vowel of the last consonant, not yet written
  let lastConsonant = "";
  let geminate = false;
  const flush = () => {
    if (pendingA) out += "a";
    pendingA = false;
  };
  for (const ch of s) {
    if (CONSONANTS[ch] !== undefined) {
      flush();
      const c = CONSONANTS[ch]!;
      out += geminate ? c[0]! + c : c;
      geminate = false;
      lastConsonant = c;
      pendingA = true;
    } else if (MATRAS[ch] !== undefined) {
      pendingA = false;
      out += MATRAS[ch];
    } else if (VOWELS[ch] !== undefined) {
      flush();
      out += VOWELS[ch];
    } else if (VIRAMA.has(ch)) {
      pendingA = false;
    } else if (NUKTA_SIGN.has(ch)) {
      const repl = NUKTA[lastConsonant];
      if (repl && out.endsWith(lastConsonant)) out = out.slice(0, -lastConsonant.length) + repl;
    } else if (NASAL.has(ch)) {
      flush();
      out += "n";
    } else if (VISARGA.has(ch)) {
      flush();
      out += "h";
    } else if (ch === ADDAK) {
      flush();
      geminate = true;
    } else if (SKIP.has(ch)) {
      // ignore
    } else {
      // Word end or a non-Indic character: Hindi and Punjabi drop the final inherent vowel.
      pendingA = false;
      out += ch;
    }
  }
  return out;
}

/**
 * Coarse cross-script sound key. Aspiration, retroflex/dental pairs, vowel
 * length and spelling variants of romanised Hindi ("kaise"/"kese") collapse,
 * so Devanagari, Gurmukhi and Latin spellings of the same spoken word agree.
 */
export function crossKey(word: string): string {
  let w = transliterate(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return word; // other scripts: compare as-is
  w = w
    .replace(/chh/g, "C")
    .replace(/ch/g, "C")
    .replace(/sh/g, "S")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "j")
    .replace(/w/g, "v")
    .replace(/([kgtdbpjCrS])h/g, "$1") // aspirates: kh→k, bh→b, th→t…
    .replace(/C/g, "c")
    .replace(/S/g, "s")
    .replace(/aa/g, "a")
    .replace(/(ee|ii|ey)/g, "i")
    .replace(/(oo|uu)/g, "u")
    .replace(/(ai|ay|ei)/g, "e")
    .replace(/(au|aw|ou)/g, "o")
    .replace(/y$/, "i");
  const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");
  const first = /^[aeiou]/.test(w) ? "a" : w[0]!;
  const skeleton = collapse(first + w.slice(1).replace(/[aeiouhy]/g, ""));
  // Short words ("ka", "ki", "ke", "ko") differ only by their vowel, so keep it.
  return skeleton.length <= 2 ? collapse(w) : skeleton;
}

/**
 * Number words that Hindi and Punjabi recognisers and scripts use, mapped to
 * the English words the rest of the pipeline uses for digits.
 */
export const INDIC_NUMBER_WORDS: Record<string, string[]> = {
  // Hindi
  "शून्य": ["zero"], "एक": ["one"], "दो": ["two"], "तीन": ["three"], "चार": ["four"], "पांच": ["five"], "पाँच": ["five"],
  "छह": ["six"], "छः": ["six"], "छे": ["six"], "सात": ["seven"], "आठ": ["eight"], "नौ": ["nine"], "दस": ["ten"],
  "ग्यारह": ["eleven"], "बारह": ["twelve"], "तेरह": ["thirteen"], "चौदह": ["fourteen"], "पंद्रह": ["fifteen"],
  "सोलह": ["sixteen"], "सत्रह": ["seventeen"], "अठारह": ["eighteen"], "उन्नीस": ["nineteen"], "बीस": ["twenty"],
  "तीस": ["thirty"], "चालीस": ["forty"], "पचास": ["fifty"], "साठ": ["sixty"], "सत्तर": ["seventy"], "अस्सी": ["eighty"],
  "नब्बे": ["ninety"], "सौ": ["hundred"], "हज़ार": ["thousand"], "हजार": ["thousand"], "लाख": ["lakh"], "करोड़": ["crore"],
  // Punjabi
  "ਸਿਫ਼ਰ": ["zero"], "ਇੱਕ": ["one"], "ਇਕ": ["one"], "ਦੋ": ["two"], "ਤਿੰਨ": ["three"], "ਚਾਰ": ["four"], "ਪੰਜ": ["five"],
  "ਛੇ": ["six"], "ਸੱਤ": ["seven"], "ਅੱਠ": ["eight"], "ਨੌਂ": ["nine"], "ਨੌ": ["nine"], "ਦਸ": ["ten"], "ਗਿਆਰਾਂ": ["eleven"],
  "ਬਾਰਾਂ": ["twelve"], "ਵੀਹ": ["twenty"], "ਤੀਹ": ["thirty"], "ਚਾਲੀ": ["forty"], "ਪੰਜਾਹ": ["fifty"], "ਸੱਠ": ["sixty"],
  "ਸੱਤਰ": ["seventy"], "ਅੱਸੀ": ["eighty"], "ਨੱਬੇ": ["ninety"], "ਸੌ": ["hundred"], "ਹਜ਼ਾਰ": ["thousand"], "ਲੱਖ": ["lakh"], "ਕਰੋੜ": ["crore"],
};

export type ScriptLanguage = "hi" | "pa" | "latin" | "other";

/** Guess a script's language from its writing system (Gurmukhi → Punjabi, Devanagari → Hindi). */
export function detectScriptLanguage(text: string): ScriptLanguage {
  let deva = 0;
  let guru = 0;
  let latin = 0;
  let other = 0;
  for (const ch of text) {
    if (/[ऀ-ॿ]/u.test(ch)) deva++;
    else if (/[਀-੿]/u.test(ch)) guru++;
    else if (/\p{Script=Latin}/u.test(ch)) latin++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  const max = Math.max(deva, guru, latin, other);
  if (!max) return "latin";
  // An Indic script with some English mixed in is still that language.
  if (guru && guru >= deva && guru >= max * 0.25) return "pa";
  if (deva && deva >= max * 0.25) return "hi";
  return max === other ? "other" : "latin";
}
