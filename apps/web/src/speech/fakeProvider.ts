import type { SpeechProvider, SpeechResult, SpeechStatus } from "./types";

declare global {
  interface Window {
    /** Set by end-to-end tests before the app loads to replace real speech recognition. */
    __promptsenseFakeSpeech?: boolean;
    __promptsenseSpeak?: (text: string, isFinal: boolean) => void;
  }
}

/**
 * Deterministic speech source for end-to-end tests: the test page calls
 * window.__promptsenseSpeak(text, isFinal) to emit recogniser results.
 */
export class FakeSpeechProvider implements SpeechProvider {
  readonly id = "fake";
  readonly label = "Test speech";
  onResult: ((r: SpeechResult) => void) | null = null;
  onStatus: ((s: SpeechStatus, detail?: string) => void) | null = null;

  async start(): Promise<void> {
    window.__promptsenseSpeak = (text, isFinal) => this.onResult?.({ text, isFinal, t: performance.now() });
    this.onStatus?.("listening");
  }

  stop(): void {
    delete window.__promptsenseSpeak;
    this.onStatus?.("idle");
  }
}
