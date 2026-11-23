/** Settings shared by the main process and both windows. Stored as JSON in the app's user-data folder. */

export type Mode = "pace" | "words" | "steady";
export type Theme = "ember" | "rose" | "ice" | "mint" | "gold" | "mono";

export interface DesktopSettings {
  script: { title: string; source: string };
  /** pace: scroll while you talk (offline, any language). words: follow your exact words (Deepgram key). steady: fixed speed. */
  mode: Mode;
  /** Words per minute for steady mode, and the starting pace for voice pace. */
  wpm: number;
  fontSize: number;
  /** Prompter width in pixels. */
  width: number;
  lines: number;
  theme: Theme;
  /** Hide the prompter from screen recording and screen sharing (OS permitting). */
  invisible: boolean;
  /** Where the prompter sits; null means snapped under the notch, top centre. */
  position: { x: number; y: number } | null;
  /** Prompter display, by Electron display id; null means the primary display. */
  displayId: number | null;
  deepgramKey: string;
  /** "auto" picks Hindi or Punjabi from the script's writing system. */
  language: string;
  mirror: boolean;
  /** React the glow to your voice. */
  voiceGlow: boolean;
}

export const DEFAULT_SCRIPT = `Hi, I'm using JOTR, a teleprompter that sits right under my camera.
It floats over every app, follows my voice, and stays out of screen recordings.
When I pause, it waits for me. When I keep talking, it keeps up.`;

export const DEFAULT_SETTINGS: DesktopSettings = {
  script: { title: "Welcome to JOTR", source: DEFAULT_SCRIPT },
  mode: "pace",
  wpm: 140,
  fontSize: 16,
  width: 470,
  lines: 4,
  theme: "ember",
  invisible: true,
  position: null,
  displayId: null,
  deepgramKey: "",
  language: "auto",
  mirror: false,
  voiceGlow: true,
};

export const THEMES: Record<Theme, { name: string; accent: string; glow: string; text: string }> = {
  ember: { name: "Ember", accent: "#ff8a3d", glow: "255, 170, 60", text: "#f4efe9" },
  rose: { name: "Rose", accent: "#ff4d6d", glow: "255, 77, 109", text: "#f7eef0" },
  gold: { name: "Gold", accent: "#ffc93c", glow: "255, 201, 60", text: "#f6f1e4" },
  ice: { name: "Ice", accent: "#59b8ff", glow: "89, 184, 255", text: "#eef4fa" },
  mint: { name: "Mint", accent: "#2ee6a6", glow: "46, 230, 166", text: "#eef7f2" },
  mono: { name: "Mono", accent: "#d8d8dc", glow: "220, 220, 230", text: "#f2f2f4" },
};

/** Width of the curved "ears" where the notch meets the top edge of the screen. */
export const EAR = 14;
/** Space under the notch for the sections pill. */
export const PILL_SPACE = 50;
/** Padding around the floating capsule, for its shadow. */
export const FLOAT_PAD = 12;

/** Height of the black notch body (text and controls), without the strip hidden behind the menu bar. */
export function bodyHeight(s: Pick<DesktopSettings, "fontSize" | "lines">): number {
  return Math.round(s.fontSize * 1.5 * s.lines + 34);
}

/** The prompter window's size: snapped under the notch (with its ears) or floating (with shadow room). */
export function prompterSize(s: Pick<DesktopSettings, "fontSize" | "lines" | "width">, snapped: boolean, topInset: number): { width: number; height: number } {
  const body = bodyHeight(s);
  return snapped
    ? { width: s.width + EAR * 2, height: topInset + body + PILL_SPACE }
    : { width: s.width + FLOAT_PAD * 2, height: body + PILL_SPACE + FLOAT_PAD * 2 };
}

/**
 * Where the camera is: notched MacBooks have a taller menu bar (the notch
 * sits in it), and their camera is in the notch, top centre. Other screens
 * usually have a webcam top centre too.
 */
export function cameraGuess(menuBarHeight: number): { notched: boolean } {
  return { notched: menuBarHeight >= 32 };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the prompter goes when it is "under the notch": top centre of the display. */
export function notchBounds(display: Rect, width: number, height: number): Rect {
  return { x: Math.round(display.x + (display.width - width) / 2), y: display.y, width, height };
}

/**
 * After a drag: snap back under the notch when dropped near the top centre,
 * otherwise keep it where it was dropped (inside the display).
 */
export function placeAfterDrag(dropped: Rect, display: Rect): { snapped: boolean; bounds: Rect } {
  const notch = notchBounds(display, dropped.width, dropped.height);
  const nearTop = dropped.y - display.y < 70;
  const nearCentre = Math.abs(dropped.x - notch.x) < Math.max(120, display.width * 0.12);
  if (nearTop && nearCentre) return { snapped: true, bounds: notch };
  const x = Math.min(Math.max(dropped.x, display.x), display.x + display.width - dropped.width);
  const y = Math.min(Math.max(dropped.y, display.y), display.y + display.height - dropped.height);
  return { snapped: false, bounds: { ...dropped, x, y } };
}

/** Bridge the preload script exposes to both windows as window.jotr. */
export interface JotrBridge {
  platform: string;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  onSettings(fn: (s: DesktopSettings) => void): void;
  /** Commands for the prompter: from the control window, the tray or a shortcut. */
  send(command: Command): void;
  onCommand(fn: (c: Command) => void): void;
  /** The prompter reports its state so the control window and tray can show it. */
  reportState(state: PrompterState): void;
  onState(fn: (s: PrompterState) => void): void;
  openExternal(url: string): void;
  /** Prompter window layout: floating or under the notch, and the menu-bar height to keep the text below. */
  onLayout(fn: (l: Layout) => void): void;
}

export interface Layout {
  floating: boolean;
  /** Pixels at the top hidden behind the notch / menu bar when snapped. */
  topInset: number;
  /** A notched MacBook screen (the camera is in the notch). */
  notched: boolean;
}

export type Command = "show" | "hide" | "toggle" | "start" | "pause" | "toggle-pause" | "restart" | "snap" | "faster" | "slower" | "back" | "forward" | "editor" | "prev-section" | "next-section";

export interface PrompterState {
  visible: boolean;
  running: boolean;
  paused: boolean;
  progress: number;
  speaking: boolean;
  listening: "off" | "starting" | "on" | "error";
  detail?: string;
}
