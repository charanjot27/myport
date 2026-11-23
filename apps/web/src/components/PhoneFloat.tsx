import { useEffect, useRef, useState } from "react";
import { floatVideo, makeScrollVideo, videoFloatSupported } from "../lib/videoFloat";
import { isAppleMobile } from "../lib/install";

const ANDROID_APK = "https://github.com/charanjot27/myport/releases/latest/download/JOTR-android.apk";
const WPM_KEY = "jotr.float.wpm";

/**
 * "Float over other apps" on phones. Android: the JOTR app floats a real notch that
 * follows your voice. Any phone (and the only way on iPhone/iPad): a floating
 * Picture-in-Picture window that scrolls the script at a steady pace.
 */
export function PhoneFloat({ text }: { text: string }) {
  const [wpm, setWpm] = useState(() => Number(localStorage.getItem(WPM_KEY)) || 140);
  const [state, setState] = useState<"idle" | "making" | "ready" | "floating">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const supported = videoFloatSupported();
  const android = !isAppleMobile() && /android/i.test(navigator.userAgent);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  // A new speed or script needs a new video.
  useEffect(() => {
    setState("idle");
    setUrl(null);
  }, [wpm, text]);

  const prepare = async () => {
    setError("");
    setState("making");
    setProgress(0);
    try {
      localStorage.setItem(WPM_KEY, String(wpm));
      const blob = await makeScrollVideo(text, wpm, setProgress);
      setUrl(URL.createObjectURL(blob));
      setState("ready");
    } catch (e) {
      setError(`Couldn't prepare the floating window: ${(e as Error).message}`);
      setState("idle");
    }
  };

  const float = async () => {
    try {
      await floatVideo(video.current!);
      setState("floating");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="phone-float" data-testid="phone-float">
      <b>Float over other apps</b>
      {android && (
        <p>
          For a notch that follows your voice over WhatsApp, Instagram or the camera, get the{" "}
          <a href={ANDROID_APK} data-testid="android-apk">
            JOTR Android app
          </a>
          . Or float a steady-scrolling window right from here:
        </p>
      )}
      {!android && <p>A small window that scrolls your script over any app. Place it near the camera; play, pause and skip from the window.</p>}
      {!supported ? (
        <p className="pf-note">This browser can’t float windows. Update to iOS 17 or newer (Safari), or use Chrome on Android.</p>
      ) : (
        <>
          <label className="pf-speed">
            Speed <b>{wpm} words/min</b>
            <input type="range" min={90} max={200} step={5} value={wpm} onChange={(e) => setWpm(Number(e.target.value))} />
          </label>
          {state === "idle" && (
            <button className="btn" onClick={() => void prepare()} disabled={!text.trim()}>
              1 · Prepare floating window
            </button>
          )}
          {state === "making" && <div className="pf-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} style={{ ["--p" as string]: progress }} />}
          {(state === "ready" || state === "floating") && (
            <button className="btn primary" onClick={() => void float()} data-testid="float-now">
              {state === "floating" ? "Float again" : "2 · Float now"}
            </button>
          )}
          {state === "floating" && <p className="pf-note">Now switch to any app. The window plays on top; tap it for play, pause and skip.</p>}
        </>
      )}
      {error && <p className="pf-note error">{error}</p>}
      {url && <video ref={video} className="pf-video" src={url} playsInline muted preload="auto" />}
    </div>
  );
}
