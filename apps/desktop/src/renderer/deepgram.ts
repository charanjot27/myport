/**
 * "Follow my words" mode: streams the microphone to Deepgram with the user's
 * own API key and returns live transcripts. Audio goes only to Deepgram.
 */

export interface Transcript {
  text: string;
  isFinal: boolean;
}

/** Deepgram language for a JOTR language code ("auto" is resolved by the caller). */
export function deepgramLanguage(code: string): string | null {
  if (code === "hinglish") return "multi";
  if (code.startsWith("pa")) return null; // no Punjabi model
  return code.split("-")[0] || "en";
}

export function connectDeepgram(
  stream: MediaStream,
  key: string,
  language: string,
  onTranscript: (t: Transcript) => void,
  onStatus: (s: "starting" | "on" | "error", detail?: string) => void,
): () => void {
  const lang = deepgramLanguage(language);
  if (!lang) {
    onStatus("error", "Deepgram has no Punjabi model. Use Voice pace for Punjabi scripts.");
    return () => undefined;
  }
  onStatus("starting");
  const params = new URLSearchParams({ model: "nova-3", language: lang, interim_results: "true", punctuate: "false", smart_format: "false", endpointing: "300" });
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", key]);
  let recorder: MediaRecorder | null = null;
  let keepAlive = 0;
  ws.onopen = () => {
    onStatus("on");
    const audio = new MediaStream(stream.getAudioTracks());
    recorder = new MediaRecorder(audio, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : undefined);
    recorder.ondataavailable = (e) => e.data.size && ws.readyState === WebSocket.OPEN && ws.send(e.data);
    recorder.start(250);
    keepAlive = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { channel?: { alternatives?: Array<{ transcript: string }> }; is_final?: boolean };
      const text = msg.channel?.alternatives?.[0]?.transcript;
      if (text) onTranscript({ text, isFinal: !!msg.is_final });
    } catch {
      // ignore non-JSON frames
    }
  };
  ws.onerror = () => onStatus("error", "Could not reach Deepgram. Check the API key in JOTR's settings.");
  ws.onclose = (e) => {
    if (e.code !== 1000) onStatus("error", e.code === 1008 || e.code === 4001 ? "Deepgram rejected the API key." : "Deepgram connection closed.");
  };
  return () => {
    clearInterval(keepAlive);
    recorder?.state === "recording" && recorder.stop();
    ws.close(1000);
  };
}
