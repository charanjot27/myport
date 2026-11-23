import { ArrayBufferTarget, Muxer } from "mp4-muxer";

/**
 * Floating over other apps on iPhone and iPad (and any phone browser): iOS lets
 * nothing draw over other apps except a Picture-in-Picture video. So the script is
 * rendered into a short MP4 of the notch scrolling at a steady pace, and that video
 * floats. A real video keeps playing after you switch apps (live drawing would
 * freeze), and the PiP window's own play/pause and skip buttons control it.
 */

const W = 720;
const H = 216;
const FPS = 24;
const LEAD = 2; // seconds before the first word moves
const TAIL = 3;

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
};

export function videoFloatSupported(): boolean {
  if (typeof window === "undefined" || !("VideoEncoder" in window) || !("VideoFrame" in window)) return false;
  const v = document.createElement("video") as WebkitVideo;
  return !!(document.pictureInPictureEnabled || v.webkitSupportsPresentationMode?.("picture-in-picture"));
}

/** Greedy word wrap for the notch width. */
function wrap(ctx: CanvasRenderingContext2D, words: string[], width: number): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  const space = ctx.measureText(" ").width;
  let start = 0;
  let x = 0;
  words.forEach((w, i) => {
    const ww = ctx.measureText(w).width;
    if (i > start && x + ww > width) {
      lines.push([start, i]);
      start = i;
      x = 0;
    }
    x += ww + space;
  });
  if (start < words.length) lines.push([start, words.length]);
  return lines;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Draw the notch at time t (seconds). */
function drawFrame(ctx: CanvasRenderingContext2D, words: string[], lines: Array<[number, number]>, wps: number, t: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  // Blue glow along the bottom, like the notch.
  const g = ctx.createRadialGradient(W / 2, H, 10, W / 2, H, W * 0.45);
  g.addColorStop(0, "rgba(80,150,230,0.42)");
  g.addColorStop(1, "rgba(80,150,230,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H / 2, W, H / 2);

  const pos = Math.max(0, (t - LEAD) * wps); // words said so far (fractional)
  const word = Math.min(words.length - 1, Math.floor(pos));
  const line = Math.max(0, lines.findIndex(([a, b]) => word >= a && word < b));
  // Glide to a new line over its first third of a second.
  const lineStartWord = lines[line]![0];
  const sinceLine = (pos - lineStartWord) / wps;
  const glide = line > 0 && sinceLine < 0.35 ? 1 - ease(Math.max(0, sinceLine) / 0.35) : 0;

  const lh = 62;
  const top = 46;
  const padX = 52;
  // Caret
  ctx.fillStyle = "#5aa9ff";
  ctx.beginPath();
  ctx.roundRect(padX - 22, top + 6, 6, 40, 3);
  ctx.fill();
  for (let li = Math.max(0, line - 1); li <= Math.min(lines.length - 1, line + 2); li++) {
    const y = top + (li - line + glide) * lh + 40;
    let x = padX;
    const [a, b] = lines[li]!;
    for (let i = a; i < b; i++) {
      const w = words[i]!;
      ctx.fillStyle = li > line ? "rgba(255,255,255,0.34)" : li < line ? "rgba(255,255,255,0.18)" : i <= word ? "#fff" : "rgba(255,255,255,0.62)";
      ctx.fillText(w, x, y);
      const ww = ctx.measureText(w).width;
      if (i === word && li === line && t >= LEAD) {
        ctx.fillStyle = "#5aa9ff";
        ctx.fillRect(x, y + 9, ww, 4);
      }
      x += ww + ctx.measureText(" ").width;
    }
  }
  // Fade the line below and cover anything gliding up above the first line.
  const f = ctx.createLinearGradient(0, top + lh, 0, H);
  f.addColorStop(0, "rgba(0,0,0,0)");
  f.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = f;
  ctx.fillRect(0, top + lh, W, H - top - lh);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, top);
  // Camera dot and a small brand mark.
  ctx.fillStyle = "#1c2433";
  ctx.beginPath();
  ctx.arc(W / 2, 20, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2ee6a6";
  ctx.beginPath();
  ctx.arc(W / 2 + 22, 20, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Render the script as an MP4 of the notch scrolling at `wpm`. */
export async function makeScrollVideo(script: string, wpm: number, onProgress?: (p: number) => void): Promise<Blob> {
  const words = script.split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error("The script is empty.");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `700 34px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.textBaseline = "alphabetic";
  const lines = wrap(ctx, words, W - 52 * 2);
  const wps = wpm / 60;
  const seconds = LEAD + words.length / wps + TAIL;
  const frames = Math.ceil(seconds * FPS);

  // H.264 everywhere it's available (all iPhones, Android Chrome); VP9 where it isn't.
  const base = { width: W, height: H, bitrate: 900_000, framerate: FPS };
  const avc = { ...base, codec: "avc1.42001f" };
  const vp9 = { ...base, codec: "vp09.00.10.08" };
  const useAvc = (await VideoEncoder.isConfigSupported(avc).catch(() => ({ supported: false }))).supported;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: useAvc ? "avc" : "vp9", width: W, height: H, frameRate: FPS }, fastStart: "in-memory" });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e as Error),
  });
  encoder.configure(useAvc ? avc : vp9);
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    drawFrame(ctx, words, lines, wps, i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % FPS === 0) onProgress?.(i / frames);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

/**
 * Float the prepared video. Must run inside a tap (iOS only allows Picture-in-Picture
 * straight from a user gesture). The video element has to be in the page.
 */
export async function floatVideo(video: HTMLVideoElement): Promise<void> {
  const v = video as WebkitVideo;
  v.muted = true;
  await v.play();
  if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
    await v.requestPictureInPicture();
  } else if (v.webkitSetPresentationMode) {
    v.webkitSetPresentationMode("picture-in-picture");
  } else {
    throw new Error("This browser can't float a window over other apps.");
  }
}
