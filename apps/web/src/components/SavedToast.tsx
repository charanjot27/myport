import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Grab a frame from a recorded video as a data URL (null if the browser can't decode it). */
export async function videoThumbnail(blob: Blob): Promise<{ image: string | null; seconds: number }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("decode"));
      setTimeout(() => reject(new Error("timeout")), 4000);
    });
    // MediaRecorder WebM files often report an unknown duration until you seek past the end.
    let seconds = video.duration;
    if (!Number.isFinite(seconds)) {
      video.currentTime = 1e7;
      await new Promise((r) => (video.onseeked = r));
      seconds = video.duration;
    }
    video.currentTime = Number.isFinite(seconds) ? Math.min(1.2, seconds / 3) : 0.5;
    await new Promise((r) => (video.onseeked = r));
    const c = document.createElement("canvas");
    const w = 480;
    c.width = w;
    c.height = Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16));
    const ctx = c.getContext("2d")!;
    // Exactly what is in the file, so the preview is proof of what was saved.
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return { image: c.toDataURL("image/jpeg", 0.82), seconds: Number.isFinite(seconds) ? seconds : 0 };
  } catch {
    return { image: null, seconds: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/**
 * Floating thumbnail that slides in after a download, like the macOS
 * screenshot preview: proof the file was saved, and a click plays it back.
 */
export function SavedToast({ blob, filename, onClose }: { blob: Blob; filename: string; onClose: () => void }) {
  const [thumb, setThumb] = useState<{ image: string | null; seconds: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    void videoThumbnail(blob).then(setThumb);
  }, [blob]);

  // Disappears on its own after a few seconds, unless hovered or playing.
  useEffect(() => {
    if (paused || playing) return;
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [paused, playing, onClose]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const play = () => {
    urlRef.current ??= URL.createObjectURL(blob);
    setPlaying(true);
  };
  const size = blob.size > 1e6 ? `${(blob.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(blob.size / 1e3))} KB`;

  return createPortal(
    <>
      <div
        className={`saved-toast${paused ? " held" : ""}`}
        role="status"
        aria-label="Video saved"
        data-testid="saved-toast"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <button className="saved-thumb" onClick={play} aria-label="Play the saved video">
          {thumb?.image ? <img src={thumb.image} alt="" /> : <span className="saved-thumb-empty" />}
          <span className="saved-play" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
            </svg>
          </span>
          {thumb && thumb.seconds > 0 && <span className="saved-dur">{mmss(thumb.seconds)}</span>}
        </button>
        <div className="saved-text">
          <b>
            <span className="saved-check" aria-hidden>
              ✓
            </span>{" "}
            Video saved
          </b>
          <span className="saved-name" title={filename}>
            {filename}
          </span>
          <span className="saved-meta">{size} · check your Downloads</span>
        </div>
        <button className="saved-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
        <span className="saved-timer" aria-hidden />
      </div>
      {playing && urlRef.current && (
        <div className="saved-player" role="dialog" aria-label="Saved video" onClick={() => setPlaying(false)}>
          <video src={urlRef.current} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>,
    document.body,
  );
}
