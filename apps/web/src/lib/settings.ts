import { useSyncExternalStore } from "react";
import { isGazeModelCompatible, type CalibrationSample, type GazeModel } from "@promptsense/core";

export type SpeechProviderId = "webspeech" | "deepgram" | "none";

/** Where the webcam is: x as a fraction of the screen width, and which screen edge. */
export interface CameraPlacement {
  x: number;
  edge: "top" | "bottom";
}

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
  /** "camera": a few lines right under the webcam, rest of the screen black. "full": classic full-screen prompter. */
  layout: "camera" | "full";
  cameraPlacement: CameraPlacement;
  /** Lines of text visible in camera layout. */
  focusLines: number;
  /** Width of the camera-layout text column as a fraction of the window width. */
  columnWidth: number;
  /** 0.2..1 text luminance; lowered by the reflection check so text does not show in eyes or glasses. */
  textBrightness: number;
  textTone: "warm" | "neutral";
  /** Adjust text brightness live to room light and measured reflections in eyes/glasses. */
  autoBrightness: boolean;
  /** Result of the last reflection check, for display. */
  reflectionCheck: { at: string; level: number; visibleAtFull: boolean; stillVisible: boolean } | null;
  /** Explicit calibration samples, kept so the model can be refined while reading. */
  calibrationSamples: CalibrationSample[];
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  speechProvider: "webspeech",
  language: "auto",
  fontSize: 40,
  lineWidth: 34,
  readingLine: 0.22,
  mirror: false,
  scrollMode: "voice",
  fixedSpeed: 40,
  pauseOnLookAway: true,
  stumbleAssist: true,
  gestureControl: false,
  showCamera: false,
  cameraId: "",
  micId: "",
  theme: "dark",
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  gazeModel: null,
  researchConsent: false,
  cornealShield: true,
  eyeContact: false,
  layout: "camera",
  cameraPlacement: { x: 0.5, edge: "top" },
  focusLines: 3,
  columnWidth: 0.42,
  textBrightness: 0.8,
  textTone: "warm",
  autoBrightness: true,
  reflectionCheck: null,
  calibrationSamples: [],
  onboarded: false,
};

const KEY = "promptsense.settings.v1";
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const loaded = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
      // Calibrations from an older feature layout cannot be used: ask for a fresh one.
      if (loaded.gazeModel && !isGazeModelCompatible(loaded.gazeModel)) {
        loaded.gazeModel = null;
        loaded.calibrationSamples = [];
      }
      return loaded;
    }
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
