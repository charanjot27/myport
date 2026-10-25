import type { SpeechProvider, SpeechProviderOptions, SpeechResult, SpeechStatus } from "./types";

interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: Array<{ transcript: string; confidence: number }> };
}

/**
 * Streaming cloud ASR via Deepgram. The browser never sees the real API key:
 * it asks our API for a short-lived token (see services/api, /asr/token) and
 * opens the WebSocket with it. Script keyterms are passed so names and jargon
 * are recognised.
 */
export class DeepgramProvider implements SpeechProvider {
  readonly id = "deepgram";
  readonly label = "Deepgram (cloud)";
  onResult: ((r: SpeechResult) => void) | null = null;
  onStatus: ((s: SpeechStatus, detail?: string) => void) | null = null;
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private keepAlive: number | null = null;

  constructor(private readonly options: SpeechProviderOptions) {}

  async start(stream: MediaStream): Promise<void> {
    if (!this.options.apiUrl) {
      this.onStatus?.("error", "Cloud speech needs the PromptSense API. Set the API URL in Settings.");
      return;
    }
    this.onStatus?.("starting");
    let token: string;
    try {
      const res = await fetch(`${this.options.apiUrl}/asr/token`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`token request failed (${res.status})`);
      token = ((await res.json()) as { token: string }).token;
    } catch (e) {
      this.onStatus?.("error", `Could not get a speech token: ${(e as Error).message}`);
      return;
    }

    const params = new URLSearchParams({
      model: "nova-3",
      interim_results: "true",
      punctuate: "false",
      smart_format: "false",
      language: this.options.language.split("-")[0] ?? "en",
      endpointing: "300",
    });
    for (const k of this.options.keyterms.slice(0, 50)) params.append("keyterm", k);

    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["bearer", token]);
    this.ws = ws;
    ws.onopen = () => {
      this.onStatus?.("listening");
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const rec = new MediaRecorder(audioOnly, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      rec.start(250);
      this.recorder = rec;
      this.keepAlive = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, 8000);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as DeepgramMessage;
      const alt = msg.channel?.alternatives?.[0];
      if (!alt || !alt.transcript) return;
      this.onResult?.({ text: alt.transcript, isFinal: !!msg.is_final, t: performance.now(), confidence: alt.confidence });
    };
    ws.onerror = () => this.onStatus?.("error", "Speech connection error");
    ws.onclose = () => {
      this.cleanup();
      this.onStatus?.("idle");
    };
  }

  private cleanup(): void {
    if (this.keepAlive !== null) window.clearInterval(this.keepAlive);
    this.keepAlive = null;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "CloseStream" }));
    this.cleanup();
    this.ws?.close();
    this.ws = null;
  }
}
