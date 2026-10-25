import type { SpeechProvider, SpeechProviderOptions, SpeechResult, SpeechStatus } from "./types";

type Ctor = new () => SpeechRecognition;

function recognitionCtor(host: Window = window): Ctor | null {
  const w = host as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

/**
 * Browser speech recognition (Chrome, Edge, Safari). Zero setup, but Chrome
 * sends audio to Google, so the settings page labels it accordingly. The
 * browser ends recognition after silence; we restart it transparently.
 */
export class WebSpeechProvider implements SpeechProvider {
  readonly id = "webspeech";
  readonly label = "Browser speech recognition";
  onResult: ((r: SpeechResult) => void) | null = null;
  onStatus: ((s: SpeechStatus, detail?: string) => void) | null = null;
  private rec: SpeechRecognition | null = null;
  private running = false;
  private restarts = 0;

  constructor(private readonly options: SpeechProviderOptions) {}

  async start(): Promise<void> {
    const host = this.options.host ?? window;
    const Rec = recognitionCtor(host) ?? recognitionCtor();
    if (!Rec) {
      this.onStatus?.("unsupported", "This browser has no built-in speech recognition. Use Chrome or Edge, or choose a cloud provider in Settings.");
      return;
    }
    this.running = true;
    this.onStatus?.("starting");
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.options.language;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = performance.now();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const alt = res[0]!;
        this.onResult?.({ text: alt.transcript, isFinal: res.isFinal, t, confidence: alt.confidence });
      }
      this.restarts = 0;
    };
    rec.onstart = () => this.onStatus?.("listening");
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
        this.onStatus?.("error", "Microphone or speech service permission denied.");
        return;
      }
      this.onStatus?.("error", e.error);
    };
    rec.onend = () => {
      if (!this.running) {
        this.onStatus?.("idle");
        return;
      }
      // Chrome stops after ~60 s or a silence; restart with backoff if it keeps failing.
      const delay = Math.min(2000, 100 * 2 ** this.restarts++);
      host.setTimeout(() => {
        if (this.running) {
          try {
            rec.start();
          } catch {
            // Already started.
          }
        }
      }, delay);
    };
    this.rec = rec;
    rec.start();
  }

  stop(): void {
    this.running = false;
    this.rec?.abort();
    this.rec = null;
  }
}
