/**
 * Records the processed video canvas plus the microphone. Nothing is
 * uploaded: the result is a Blob the user downloads.
 */

const CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export class SessionRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  readonly mimeType = pickMimeType();

  get supported(): boolean {
    return typeof MediaRecorder !== "undefined";
  }

  start(canvas: HTMLCanvasElement, audio: MediaStream | null, fps = 30): void {
    const video = canvas.captureStream(fps);
    const tracks = [...video.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: 5_000_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  stop(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || "video/webm" }));
      rec.stop();
    });
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function extensionFor(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}
