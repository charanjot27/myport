import { parseScript, ScriptAligner, wordAtToken } from "@promptsense/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalibrationStage } from "../components/CalibrationStage";
import { detectDevice, focusFrame, textColor, type DeviceInfo } from "../lib/device";
import { openMedia, stopMedia } from "../lib/media";
import { EyeGlareMeter, runReflectionCheck, type ReflectionResult } from "../lib/reflection";
import { getSettings, updateSettings, useSettings, type CameraPlacement } from "../lib/settings";
import { createSpeechProvider, type SpeechProvider } from "../speech";
import { VoiceActivity } from "../speech/vad";
import { sharedVision, type VisionFrame } from "../vision/visionEngine";

/**
 * First-run tour, under a minute: camera check → where is your camera →
 * reflection check → 8-second calibration → read one line. Every step has
 * Next and the whole tour can be skipped; everything can be redone later.
 */

const STEPS = ["Welcome", "Camera", "Camera position", "Reflections", "Calibration", "Try it"] as const;
const TRY_LINE = "This text sits right under my camera, so I look at the lens while I read.";

const POSITIONS: Array<{ label: string; p: CameraPlacement }> = [
  { label: "Top left", p: { x: 0.15, edge: "top" } },
  { label: "Top centre", p: { x: 0.5, edge: "top" } },
  { label: "Top right", p: { x: 0.85, edge: "top" } },
  { label: "Bottom centre", p: { x: 0.5, edge: "bottom" } },
];

export function WelcomePage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [faceFound, setFaceFound] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [visionReady, setVisionReady] = useState(false);
  const [reflection, setReflection] = useState<ReflectionResult | null>(null);
  const [testLevel, setTestLevel] = useState<number | null>(null);
  const [reflectionRun, setReflectionRun] = useState(0);
  const [calib, setCalib] = useState<"idle" | "running" | "done" | "error">("idle");
  const [calibText, setCalibText] = useState("");
  const [spokenUpTo, setSpokenUpTo] = useState(-1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latestFrame = useRef<VisionFrame | null>(null);
  const vadRef = useRef<VoiceActivity | null>(null);
  const speechRef = useRef<SpeechProvider | null>(null);
  const meter = useMemo(() => new EyeGlareMeter(), []);

  const frame = focusFrame({ placement: settings.cameraPlacement, fontSize: settings.fontSize, lines: settings.focusLines, columnWidth: settings.columnWidth });
  const dark = step >= 3;

  const cleanup = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
    const v = sharedVision();
    v.stop();
    v.onFrame = null;
    stopMedia(streamRef.current);
    streamRef.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const finish = async () => {
    updateSettings({ onboarded: true });
    cleanup();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    navigate("/");
  };

  // Step 1: camera + mic, face tracking, mic level.
  const startCamera = async () => {
    setError("");
    try {
      const stream = await openMedia({ video: true, audio: true, cameraId: getSettings().cameraId, micId: getSettings().micId });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      setDevice(await detectDevice(stream.getVideoTracks()[0]));
      const vad = new VoiceActivity();
      vad.start(stream);
      vadRef.current = vad;
      const tick = () => {
        if (!vadRef.current) return;
        vad.sample(performance.now());
        setMicLevel(Math.min(1, vad.level * 25));
        requestAnimationFrame(tick);
      };
      tick();
      const vision = sharedVision();
      await vision.load({ hands: false });
      vision.options = { hands: false, skin: false };
      vision.onFrame = (f) => {
        latestFrame.current = f;
        setFaceFound(!!f.face);
      };
      vision.start(v);
      setVisionReady(true);
    } catch (e) {
      setError((e as Error).message);
      setDevice(await detectDevice(null));
    }
  };

  // Step 3: reflection check runs as soon as the step opens (and a face is visible).
  useEffect(() => {
    if (step !== 3 || reflection || !visionReady) return;
    const abort = new AbortController();
    const video = videoRef.current!;
    runReflectionCheck({
      show: setTestLevel,
      sample: () => {
        const f = latestFrame.current;
        return f?.face && !f.face.features.blink ? meter.measure(video, f.face.landmarks) : null;
      },
      signal: abort.signal,
    })
      .then((r) => {
        setReflection(r);
        updateSettings({
          textBrightness: r.level,
          reflectionCheck: { at: new Date().toISOString(), level: r.level, visibleAtFull: r.visibleAtFull, stillVisible: r.stillVisible },
        });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [step, visionReady, reflectionRun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 5: read one line aloud; the words light up as you say them.
  const tryScript = useMemo(() => parseScript(TRY_LINE), []);
  useEffect(() => {
    if (step !== 5 || !streamRef.current) return;
    const aligner = new ScriptAligner(tryScript);
    const s = getSettings();
    const provider = createSpeechProvider(s.speechProvider === "none" ? "webspeech" : s.speechProvider, { language: s.language, keyterms: [], apiUrl: s.apiUrl });
    if (!provider) return;
    provider.onResult = (r) => {
      const u = aligner.update(r.text, r.isFinal, r.t);
      if (u.lastMatched >= 0) setSpokenUpTo(wordAtToken(tryScript, u.lastMatched));
    };
    speechRef.current = provider;
    void provider.start(streamRef.current);
    return () => provider.stop();
  }, [step, tryScript]);

  const next = async () => {
    setError("");
    // Entering the dark steps: go fullscreen (the Next click is the user gesture browsers require).
    if (step === 2) await document.documentElement.requestFullscreen?.().catch(() => undefined);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const latestVector = () => {
    const f = latestFrame.current;
    return f?.face && !f.face.features.blink ? { t: f.t, vector: f.face.features.vector } : null;
  };

  const stepDone = step === 0 || (step === 1 && faceFound) || step === 2 || (step === 3 && !!reflection) || (step === 4 && calib === "done") || step === 5;
  const canSkipStep = !stepDone && step < STEPS.length - 1 && !(step === 4 && calib === "running");

  const primaryAction = () => {
    if (step === 1 && !streamRef.current)
      return (
        <button className="btn primary" onClick={() => void startCamera()}>
          Allow camera &amp; mic
        </button>
      );
    if (step === 3 && visionReady && error)
      return (
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setReflectionRun((n) => n + 1);
          }}
        >
          Try again
        </button>
      );
    if (step === 4 && visionReady && calib !== "done")
      return (
        <button className="btn primary" disabled={calib === "running"} onClick={() => setCalib("running")}>
          {calib === "error" ? "Try again" : calib === "running" ? "Follow the dot…" : "Start (8 s)"}
        </button>
      );
    if (step === STEPS.length - 1)
      return (
        <button className="btn primary" onClick={() => void finish()}>
          Finish
        </button>
      );
    return (
      <button className="btn primary" disabled={!stepDone} onClick={() => void next()}>
        Next
      </button>
    );
  };

  const textStyle = (level: number) => ({
    left: frame.left,
    top: frame.top,
    width: frame.width,
    minHeight: frame.height,
    fontSize: settings.fontSize,
    color: textColor(level, settings.textTone),
  });

  return (
    <div className={dark ? "tour tour-dark" : "tour"} data-testid="tour">
      <video ref={videoRef} muted playsInline className={step === 1 ? "tour-preview" : "tour-hidden-video"} />

      {/* Reflection test text, shown in the real prompter position. */}
      {step === 3 && testLevel !== null && (
        <div className="tour-text" style={textStyle(testLevel)} aria-hidden>
          The quick brown fox reads the script right under the camera lens.
        </div>
      )}
      {step === 4 && calib === "running" && (
        <CalibrationStage
          latest={latestVector}
          onDone={(r) => {
            setCalib("done");
            setCalibText(`Accuracy: ${r.quality.label} (about ${r.quality.lines.toFixed(1)} lines)`);
          }}
          onError={(m) => {
            setCalib("error");
            setCalibText(m);
          }}
        />
      )}
      {step === 4 && calib !== "running" && <div className="tour-frame" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }} />}
      {step === 5 && (
        <div className="tour-text" style={textStyle(settings.textBrightness)} data-testid="try-text">
          {tryScript.words.map((w) => (
            <span key={w.index} style={{ opacity: w.index <= spokenUpTo ? 0.42 : 1 }}>
              {w.display}{" "}
            </span>
          ))}
        </div>
      )}

      <div
        className={`tour-panel${dark ? " bottom" : ""}`}
        role="dialog"
        aria-label={`Setup step ${step + 1} of ${STEPS.length}`}
        // Nothing but the dot on screen while calibrating: less distraction, no extra light.
        style={step === 4 && calib === "running" ? { display: "none" } : undefined}
      >
        <div className="tour-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <div className="muted" style={{ fontSize: "0.8rem" }}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
        <div className="tour-step" key={step}>
        {!dark && <div className="tour-icon" aria-hidden>{["👋", "🎥", "📍", "✨", "🎯", "🗣️"][step]}</div>}

        {step === 0 && (
          <>
            <h1>Set up in under a minute</h1>
            <p>
              PromptSense puts your script <strong>right under your camera</strong>, so viewers see you looking at them. It follows your voice and keeps the text
              too dim to reflect in your eyes or glasses.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Camera and microphone</h2>
            {!streamRef.current ? (
              <p>Allow access so we can find your face and hear you. Video never leaves this device.</p>
            ) : (
              <ul className="checklist">
                <li className={faceFound ? "ok" : ""}>{faceFound ? "Face found" : visionReady ? "Looking for your face… sit facing the screen" : "Loading face tracking…"}</li>
                <li className={micLevel > 0.15 ? "ok" : ""}>
                  Microphone <span className="meter"><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></span> say something
                </li>
              </ul>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Where is your camera?</h2>
            {device && (
              <p className="muted" data-testid="device-summary">
                Detected: {device.summary}. {device.browser.name} {device.browser.version}
                {device.browser.note ? ` · ${device.browser.note}` : " ✓"}
              </p>
            )}
            <div className="screen-picker" role="radiogroup" aria-label="Camera position">
              {POSITIONS.map(({ label, p }) => {
                const selected = settings.cameraPlacement.x === p.x && settings.cameraPlacement.edge === p.edge;
                return (
                  <button
                    key={label}
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    className={`cam-spot${selected ? " selected" : ""}`}
                    style={{ left: `${p.x * 100}%`, [p.edge]: -9 }}
                    onClick={() => updateSettings({ cameraPlacement: p })}
                  />
                );
              })}
              <div className="picker-text" style={{ left: `${settings.cameraPlacement.x * 100}%`, [settings.cameraPlacement.edge]: 14 }}>
                text goes here
              </div>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              <span className="hint">External webcam not in the middle? Fine-tune:</span>
              <input type="range" min={5} max={95} value={Math.round(settings.cameraPlacement.x * 100)} onChange={(e) => updateSettings({ cameraPlacement: { ...settings.cameraPlacement, x: Number(e.target.value) / 100 } })} aria-label="Camera horizontal position" />
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Reflection check</h2>
            {!visionReady ? (
              <p>Needs the camera. You can skip this and adjust brightness later with ☾ ☀.</p>
            ) : !reflection ? (
              <p>Look at the blinking text near your camera for a few seconds. We're checking whether it shows up in your eyes or glasses.</p>
            ) : (
              <p data-testid="reflection-result">
                {reflection.stillVisible
                  ? "Some reflection is still visible at the dimmest text. Lower your screen brightness a little or tilt the screen back slightly."
                  : reflection.visibleAtFull
                    ? `Bright text showed up in your ${"eyes or glasses"}. Text is set to ${Math.round(reflection.level * 100)}% brightness, where it no longer does.`
                    : "No visible reflection. Text brightness is set to a comfortable level."}
              </p>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2>Quick calibration</h2>
            {calib === "idle" && <p>Follow the dot with your eyes (about 8 seconds). It only visits the area where your text appears.</p>}
            {calib === "running" && <p>Follow the dot…</p>}
            {calib === "done" && <p data-testid="calib-result">{calibText}. It keeps fine-tuning itself while you read.</p>}
            {calib === "error" && <div className="alert error">{calibText}</div>}
          </>
        )}

        {step === 5 && (
          <>
            <h2>Try it</h2>
            <p>Read the line under your camera out loud. Words dim as you say them. That's it, you're ready.</p>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Tip: press <strong>⧉ Start floating</strong> on any script to keep the text on top of Meet, an interview site or any other tab or app.
            </p>
          </>
        )}

        </div>
        {error && <div className="alert error">{error}</div>}

        <div className="row" style={{ marginTop: 12 }}>
          {primaryAction()}
          {canSkipStep && (
            <button className="btn" onClick={() => void next()}>
              Skip this step
            </button>
          )}
          {step === 4 && calib === "done" && (
            <button className="btn" onClick={() => setCalib("running")}>
              Redo
            </button>
          )}
          <div className="grow" />
          {step < STEPS.length - 1 && (
            <button className="btn small" onClick={() => void finish()}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
