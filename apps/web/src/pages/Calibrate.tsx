import { calibrationGrid, fitGazeModel, predictGaze, type CalibrationSample } from "@promptsense/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openMedia, stopMedia } from "../lib/media";
import { getSettings, updateSettings } from "../lib/settings";
import { sharedVision, type VisionFrame } from "../vision/visionEngine";

type Step = "intro" | "loading" | "collect" | "validate" | "done" | "error";

const SETTLE_MS = 700;
const COLLECT_MS = 900;
const VALIDATION_POINTS = [
  { x: 0.3, y: 0.25 },
  { x: 0.7, y: 0.25 },
  { x: 0.5, y: 0.55 },
  { x: 0.25, y: 0.8 },
];

/**
 * 9-point gaze calibration followed by a 4-point validation. Takes about 20
 * seconds and should be repeated if the camera or seating position changes.
 */
export function CalibratePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("intro");
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState("");
  const [faceOk, setFaceOk] = useState(false);
  const [result, setResult] = useState<{ train: number; validation: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latest = useRef<VisionFrame | null>(null);
  const cancelled = useRef(false);

  useEffect(
    () => () => {
      cancelled.current = true;
      const v = sharedVision();
      v.stop();
      v.onFrame = null;
      stopMedia(streamRef.current);
    },
    [],
  );

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const collect = async (target: { x: number; y: number }): Promise<number[][]> => {
    setDot(target);
    setCollecting(false);
    await sleep(SETTLE_MS);
    setCollecting(true);
    const out: number[][] = [];
    const end = performance.now() + COLLECT_MS;
    let lastT = 0;
    while (performance.now() < end) {
      const f = latest.current;
      if (f?.face && !f.face.features.blink && f.t !== lastT) {
        out.push(f.face.features.vector);
        lastT = f.t;
      }
      await sleep(30);
    }
    return out;
  };

  const run = async () => {
    try {
      setStep("loading");
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      const stream = await openMedia({ video: true, audio: false, cameraId: getSettings().cameraId });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const vision = sharedVision();
      await vision.load({ hands: false });
      vision.options = { hands: false, skin: false };
      vision.onFrame = (f) => {
        latest.current = f;
        setFaceOk(!!f.face);
      };
      vision.start(video);
      // Wait for a face.
      for (let i = 0; i < 100 && !latest.current?.face; i++) await sleep(100);
      if (!latest.current?.face) throw new Error("No face found. Sit facing the camera with your face well lit.");

      setStep("collect");
      const samples: CalibrationSample[] = [];
      for (const p of calibrationGrid(0.08)) {
        if (cancelled.current) return;
        for (const f of await collect(p)) samples.push({ features: f, x: p.x, y: p.y });
      }
      if (samples.length < 30) throw new Error("Too few good frames. Check lighting and try again.");
      const model = fitGazeModel(samples);

      setStep("validate");
      let err = 0;
      let n = 0;
      for (const p of VALIDATION_POINTS) {
        if (cancelled.current) return;
        const feats = await collect(p);
        for (const f of feats) {
          const g = predictGaze(model, f);
          err += Math.hypot(g.x - p.x, (g.y - p.y) * (window.innerHeight / window.innerWidth));
          n++;
        }
      }
      const validation = n ? err / n : 1;
      setResult({ train: model.trainError, validation });
      updateSettings({ gazeModel: model });
      setStep("done");
      setDot(null);
      await document.exitFullscreen?.().catch(() => undefined);
    } catch (e) {
      setMessage((e as Error).message);
      setStep("error");
      await document.exitFullscreen?.().catch(() => undefined);
    } finally {
      const v = sharedVision();
      v.stop();
      stopMedia(streamRef.current);
      streamRef.current = null;
    }
  };

  const quality = result ? (result.validation < 0.08 ? "good" : result.validation < 0.15 ? "usable (line-level)" : "poor") : "";

  return (
    <div className="fullscreen">
      <video ref={videoRef} muted playsInline style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      {dot && <div className={`calib-dot${collecting ? " collect" : ""}`} style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }} />}
      {(step === "collect" || step === "validate") && (
        <div style={{ position: "absolute", bottom: 16, width: "100%", textAlign: "center", color: "#888" }}>
          {step === "collect" ? "Look at the dot. Keep your head still." : "Checking accuracy…"} {faceOk ? "" : " · face lost"}
        </div>
      )}
      {step === "intro" && (
        <div className="center-panel card">
          <h1>Gaze calibration</h1>
          <p className="muted">
            Sit where you'll sit while recording, with the prompter window where you'll use it. Follow the dot with your eyes for about 20 seconds.
            Everything is processed on this device.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => void run()} data-testid="calibrate-start">
              Start calibration
            </button>
            <button className="btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {step === "loading" && <div className="center-panel">Loading face tracking…</div>}
      {step === "done" && result && (
        <div className="center-panel card">
          <h1>Calibrated</h1>
          <p>
            Accuracy: <strong>{quality}</strong> (average error {(result.validation * 100).toFixed(1)}% of screen width)
          </p>
          <p className="muted">
            Webcam gaze is accurate to about a line of text. Stumble prediction uses line-level gaze, so “usable” is fine.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => navigate("/")}>
              Done
            </button>
            <button className="btn" onClick={() => setStep("intro")}>
              Recalibrate
            </button>
          </div>
        </div>
      )}
      {step === "error" && (
        <div className="center-panel card">
          <h1>Calibration failed</h1>
          <p>{message}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => setStep("intro")}>
              Try again
            </button>
            <button className="btn" onClick={() => navigate("/")}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
