/**
 * Text normalisation shared by the script tokenizer and the ASR side, so that
 * "10", "ten" and "Ten," all compare equal during alignment.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: Array<[number, string]> = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

/** Spell out a non-negative integer in English words ("2026" -> ["two","thousand","twenty","six"]). */
export function numberToWords(n: number): string[] {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return [String(n)];
  if (n < 20) return [ONES[n]!];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)]!;
    return n % 10 === 0 ? [t] : [t, ONES[n % 10]!];
  }
  if (n < 1000) {
    const rest = n % 100;
    return [ONES[Math.floor(n / 100)]!, "hundred", ...(rest ? numberToWords(rest) : [])];
  }
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const rest = n % value;
      return [...numberToWords(Math.floor(n / value)), name, ...(rest ? numberToWords(rest) : [])];
    }
  }
  return [String(n)];
}

/**
 * Years like 1999 or 2026 are usually read as "nineteen ninety nine" /
 * "twenty twenty six". We accept either reading by emitting the year form for
 * four-digit numbers in the 1100–2099 range except exact thousands/hundreds.
 */
function yearToWords(n: number): string[] | null {
  if (n < 1100 || n > 2099) return null;
  if (n % 100 === 0) return null;
  if (n >= 2000 && n < 2010) return null; // "two thousand five"
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  return [...numberToWords(hi), ...(lo < 10 ? ["oh", ONES[lo]!] : numberToWords(lo))];
}

const SYMBOL_WORDS: Record<string, string[]> = {
  "%": ["percent"],
  "&": ["and"],
  "+": ["plus"],
  "@": ["at"],
  "$": ["dollars"],
  "€": ["euros"],
  "£": ["pounds"],
  "₹": ["rupees"],
};

/** Lowercase, NFKC, strip apostrophes and anything that is not a letter, mark or digit. */
export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/['’ʼ]/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

/**
 * Turn one raw display word into the spoken units it will most likely be heard
 * as. A display word can produce zero units ("—") or several ("10%" ->
 * ["ten","percent"]).
 */
export function spokenUnits(raw: string): string[] {
  const cleaned = raw.normalize("NFKC");
  const out: string[] = [];
  // Split around digits and the symbols that are spoken aloud.
  const parts = cleaned.match(/\d+(?:[.,]\d+)?|[%&+@$€£₹]|[^\d%&+@$€£₹]+/gu) ?? [];
  const currency: string[] = [];
  for (const part of parts) {
    if (/^\d/.test(part)) {
      const asNumber = Number(part.replace(/,/g, ""));
      if (part.includes(".")) {
        const [whole, frac] = part.split(".");
        out.push(...numberToWords(Number(whole)), "point", ...[...(frac ?? "")].map((d) => ONES[Number(d)]!));
      } else if (/^\d{4}$/.test(part) && yearToWords(asNumber)) {
        out.push(...yearToWords(asNumber)!);
      } else {
        out.push(...numberToWords(asNumber));
      }
      if (currency.length) out.push(...currency.splice(0));
    } else if (SYMBOL_WORDS[part]) {
      // Currency symbols precede the number but are spoken after it.
      if (part === "$" || part === "€" || part === "£" || part === "₹") currency.push(...SYMBOL_WORDS[part]!);
      else out.push(...SYMBOL_WORDS[part]!);
    } else {
      for (const piece of part.split(/[-‐–—/]+/u)) {
        const w = normalizeWord(piece);
        if (w) out.push(w);
      }
    }
  }
  out.push(...currency);
  return out;
}

/** Normalise an ASR transcript string into comparable spoken units. */
export function normalizeTranscript(text: string): string[] {
  return text
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap(spokenUnits);
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (cur[j]! < rowMin) rowMin = cur[j]!;
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}
