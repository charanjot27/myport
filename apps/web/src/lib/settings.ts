import { useSyncExternalStore } from "react";
import type { GazeModel } from "@promptsense/core";

export type SpeechProviderId = "webspeech" | "deepgram" | "none";

export interface Settings {
  speechProvider: SpeechProviderId;
  language: string;
  fontSize: number;
  lineWidth: number;
  /** Fraction of the viewport height where the active line sits (near the top = near the camera). */
  readingLine: number;
  mirror: boolean;
  scrollMode: "voice" | "fixed" | "manual";
  fixedSpeed: number;
  pauseOnLookAway: boolean;
  stumbleAssist: boolean;
  gestureControl: boolean;
  showCamera: boolean;
  cameraId: string;
  micId: string;
  theme: "dark" | "light";
  apiUrl: string;
  gazeModel: GazeModel | null;
  researchConsent: boolean;
  /** Blur corneal reflections in recordings (module 5 shield). */
  cornealShield: boolean;
  /** Saccade-aware eye contact correction in recordings (module 2). */
  eyeContact: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  speechProvider: "webspeech",
  language: "en-US",
  fontSize: 44,
  lineWidth: 34,
  readingLine: 0.22,
  mirror: false,
  scrollMode: "voice",
  fixedSpeed: 40,
  pauseOnLookAway: true,
  stumbleAssist: true,
  gestureControl: false,
  showCamera: true,
  cameraId: "",
  micId: "",
  theme: "dark",
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  gazeModel: null,
  researchConsent: false,
  cornealShield: true,
  eyeContact: false,
};

const KEY = "promptsense.settings.v1";
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage blocked (private mode) or corrupt; fall back to defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

let current = load();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Keep working in memory.
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
