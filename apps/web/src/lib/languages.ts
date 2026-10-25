import { detectScriptLanguage } from "@promptsense/core";

/** Languages offered in Settings. "auto" picks one from the script's writing system. */
export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "auto", label: "Auto: match the script (Hindi, Punjabi or English)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "hi-IN", label: "हिन्दी · Hindi" },
  { code: "hinglish", label: "Hinglish · Hindi and English mixed" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ · Punjabi" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "ja-JP", label: "日本語" },
];

const KNOWN = new Set(LANGUAGES.map((l) => l.code));

/** Turn the Settings choice into a concrete language for this script. */
export function resolveLanguage(setting: string, scriptSource = ""): string {
  if (setting !== "auto") return setting;
  const detected = detectScriptLanguage(scriptSource);
  if (detected === "pa") return "pa-IN";
  if (detected === "hi") return "hi-IN";
  const nav = typeof navigator !== "undefined" ? navigator.language : "en-US";
  if (KNOWN.has(nav)) return nav;
  if (nav.startsWith("hi")) return "hi-IN";
  if (nav.startsWith("pa")) return "pa-IN";
  return nav.startsWith("en") ? "en-US" : "en-US";
}

/**
 * Codes for the browser recogniser, best first. Google's Hindi model already
 * handles English mixed into Hindi, so Hinglish uses it too.
 */
export function webSpeechLanguages(code: string): string[] {
  if (code === "hinglish") return ["hi-IN", "en-IN"];
  if (code === "pa-IN") return ["pa-Guru-IN", "pa-IN"];
  return [code];
}

/** Deepgram language parameter; Punjabi is not offered there, so callers fall back to the browser recogniser. */
export function deepgramLanguage(code: string): string | null {
  if (code === "hinglish") return "multi"; // code-switching model
  if (code.startsWith("pa")) return null;
  return code.split("-")[0] ?? "en";
}

/** BCP 47 tag for the lang attribute, so the browser picks the right fonts and line breaking. */
export function htmlLang(code: string): string {
  if (code === "hinglish") return "hi-Latn";
  return code.split("-")[0] ?? "en";
}
