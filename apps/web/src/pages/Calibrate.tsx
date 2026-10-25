import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalibrationStage } from "../components/CalibrationStage";
import { focusFrame } from "../lib/device";
import { openMedia, stopMedia } from "../lib/media";
import { getSettings, useSettings } from "../lib/settings";
import { sharedVision, type VisionFrame } from "../vision/visionEngine";

type Step = "intro" | "loading" | "running" | "done" | "error";

/** Standalone recalibration (the setup tour runs the same 8-second calibration). */
export function CalibratePage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState<Step>("intro");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latest = useRef<VisionFrame | null>(null);
  const frame = focusFrame({ placement: settings.cameraPlacement, fontSize: settings.fontSize, lines: settings.focusLines, columnWidth: settings.columnWidth });

  const stop = () => {
    const v = sharedVision();
    v.stop();
    v.onFrame = null;
    stopMedia(streamRef.current);
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    try {
      setStep("loading");
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      const stream = await openMedia({ video: true, audio: false, cameraId: getSettings().cameraId });
      streamRef.current = stream;
      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();
      const vision = sharedVision();
      await vision.load({ hands: false });
      vision.options = { hands: false, skin: false };
      vision.onFrame = (f) => (latest.current = f);
      vision.start(videoRef.current!);
      for (let i = 0; i < 100 && !latest.current?.face; i++) await new Promise((r) => setTimeout(r, 100));
      if (!latest.current?.face) throw new Error("No face found. Sit facing the camera with your face well lit.");
      setStep("running");
    } catch (e) {
      setMessage((e as Error).message);
      setStep("error");
      stop();
    }
  };

  const end = async (s: Step, msg: string) => {
    stop();
    setMessage(msg);
    setStep(s);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };

  return (
    <div className="fullscreen">
      <video ref={videoRef} muted playsInline style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      {step !== "running" && <div className="tour-frame" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }} />}
      {step === "running" && (
        <CalibrationStage
          latest={() => {
            const f = latest.current;
            return f?.face && !f.face.features.blink ? { t: f.t, vector: f.face.features.vector } : null;
          }}
          onDone={(r) => void end("done", `Accuracy: ${r.quality.label} (about ${r.quality.lines.toFixed(1)} lines). It keeps improving while you read.`)}
          onError={(m) => void end("error", m)}
        />
      )}
      {step !== "running" && (
        <div className="center-panel card" style={{ top: "60%" }}>
          {step === "intro" && (
            <>
              <h1>Gaze calibration</h1>
              <p className="muted">Follow the dot for about 8 seconds. It only visits the text area under your camera. Everything is processed on this device.</p>
            </>
          )}
          {step === "loading" && <p>Loading face tracking…</p>}
          {step === "done" && <h1>Calibrated</h1>}
          {(step === "done" || step === "error") && <p>{message}</p>}
          <div className="row" style={{ justifyContent: "center" }}>
            {step !== "loading" && (
              <button className="btn primary" onClick={() => void start()} data-testid="calibrate-start">
                {step === "intro" ? "Start" : "Calibrate again"}
              </button>
            )}
            <button className="btn" onClick={() => navigate("/")}>
              {step === "done" ? "Done" : "Back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
