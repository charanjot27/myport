export interface SpeechResult {
  text: string;
  isFinal: boolean;
  /** performance.now() when the result arrived. */
  t: number;
  confidence?: number;
}

export type SpeechStatus = "idle" | "starting" | "listening" | "error" | "unsupported";

export interface SpeechProvider {
  readonly id: string;
  readonly label: string;
  start(stream: MediaStream): Promise<void>;
  stop(): void;
  onResult: ((r: SpeechResult) => void) | null;
  onStatus: ((s: SpeechStatus, detail?: string) => void) | null;
}

export interface SpeechProviderOptions {
  language: string;
  /** Words worth boosting in the recogniser (names, jargon from the script). */
  keyterms: string[];
  apiUrl: string;
  /** Window to run recognition in (a floating Picture-in-Picture window stays active when our tab is hidden). */
  host?: Window;
}
