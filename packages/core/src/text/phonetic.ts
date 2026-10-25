/**
 * A compact Metaphone-style phonetic key. It is deliberately simple: the goal is
 * that common ASR confusions ("their"/"there", "to"/"two", "night"/"knight")
 * map to the same key, not linguistic accuracy. Non-Latin words are returned
 * unchanged so exact matching still works for Indic and other scripts.
 */
export function phoneticKey(word: string): string {
  if (!word) return "";
  if (!/^[a-z]+$/.test(word)) return word;
  let w = word;

  // Initial clusters with silent letters.
  w = w.replace(/^(kn|gn|pn|wr|ps)/, (m) => m[1]!);
  w = w.replace(/^x/, "s");
  w = w.replace(/^wh/, "w");

  w = w
    .replace(/tch/g, "ch")
    .replace(/dg(?=[eiy])/g, "j")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/sch/g, "sk")
    .replace(/(?<!^)gh(?![aeiou])/g, "")
    .replace(/^gh/, "g")
    .replace(/mb$/, "m")
    .replace(/th/g, "0")
    .replace(/sh/g, "x")
    .replace(/ch/g, "x")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "f")
    .replace(/d/g, "t")
    .replace(/g(?=[eiy])/g, "j");

  // Keep the first letter's vowel-ness, drop later vowels, 'w', 'h' and 'y' that are not leading.
  const first = /^[aeiou]/.test(w) ? "a" : w[0]!;
  const rest = w.slice(1).replace(/[aeiouhwy]/g, "");
  let key = first + rest;
  // Collapse runs of the same letter.
  key = key.replace(/(.)\1+/g, "$1");
  return key;
}
