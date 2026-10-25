import { generateChallenge, scoreLiveness, tintAt, type LivenessChallenge, type LivenessResult, type SkinSample } from "@promptsense/core";
import { useEffect, useRef, useState } from "react";
import { api, apiConfigured, type Attestation, type LivenessChallengeDto } from "../lib/api";
import { useAuth } from "../lib/auth";
import { openMedia, stopMedia } from "../lib/media";
import { getSettings } from "../lib/settings";
import { downloadBlob } from "../recording/recorder";
import { sharedVision } from "../vision/visionEngine";

type Step = "intro" | "running" | "done" | "error";

/**
 * Screen-light liveness check (module 5). With the API configured, the server
 * issues the challenge, scores the reflected-light samples itself and returns
 * a signed attestation anyone can verify with the published public key.
 * Without it, the check runs locally and is clearly marked unsigned.
 */
export function VerifyPage() {
  const [step, setStep] = useState<Step>("intro");
  const [tint, setTint] = useState<string | null>(null);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const user = useAuth();
  const serverMode = apiConfigured() && !!user;

  useEffect(
    () => () => {
      const v = sharedVision();
      v.stop();
      v.onFrame = null;
      stopMedia(streamRef.current);
    },
    [],
  );

  const run = async () => {
    setStep("running");
    setResult(null);
    setAttestation(null);
    try {
      const stream = await openMedia({ video: true, audio: false, cameraId: getSettings().cameraId });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      // Fixed exposure makes the reflection easier to see where the browser allows it.
      const track = stream.getVideoTracks()[0];
      await track?.applyConstraints({ advanced: [{ exposureMode: "manual" } as MediaTrackConstraintSet] }).catch(() => undefined);

      const vision = sharedVision();
      await vision.load({ hands: false });
      vision.options = { hands: false, skin: true };

      let challenge: LivenessChallenge;
      if (serverMode) {
        const dto = await api<LivenessChallengeDto>("/liveness/challenge", { method: "POST" });
        challenge = dto;
      } else {
        challenge = generateChallenge(crypto.randomUUID(), crypto.randomUUID());
      }

      const samples: SkinSample[] = [];
      let t0 = 0;
      vision.onFrame = (f) => {
        if (t0 && f.skin) samples.push({ t: f.t - t0, rgb: f.skin });
      };
      vision.start(video);
      await new Promise((r) => setTimeout(r, 800)); // let the camera settle

      // Drive the tint schedule from requestAnimationFrame on the same clock as the samples.
      await new Promise<void>((resolve) => {
        t0 = performance.now();
        const frame = () => {
          const c = tintAt(challenge, performance.now() - t0);
          if (!c) {
            setTint(null);
            setTimeout(resolve, 400);
            return;
          }
          setTint(`rgb(${c[0]}, ${c[1]}, ${c[2]})`);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      vision.stop();
      vision.onFrame = null;
      stopMedia(stream);
      streamRef.current = null;

      if (serverMode) {
        const res = await api<{ result: LivenessResult; attestation: Attestation | null }>("/liveness/verify", {
          method: "POST",
          json: { challengeId: challenge.id, samples },
        });
        setResult(res.result);
        setAttestation(res.attestation);
      } else {
        setResult(scoreLiveness(challenge, samples));
      }
      setStep("done");
    } catch (e) {
      setMessage((e as Error).message);
      setStep("error");
      setTint(null);
    }
  };

  return (
    <main className="page">
      <video ref={videoRef} muted playsInline style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      {tint && (
        <div className="fullscreen" style={{ background: tint, display: "grid", placeItems: "center", color: "#222" }} aria-live="polite">
          <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>Look at the screen and hold still…</div>
        </div>
      )}
      <h1>Verify you're live</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        The screen shows a short random sequence of soft colour tints. A real face reflects that light with the right timing; a replayed or
        synthetic video can't predict it. The result can be attached to your recording as a “verified live” badge.
      </p>
      <div className="alert">
        Photosensitivity: the colours change at most about twice per second and are gentle tints, not flashes. Skip this check if you are sensitive to
        changing light.
      </div>
      {!serverMode && (
        <p className="muted">
          {apiConfigured() ? "Sign in" : "Connect the PromptSense API in Settings"} to get a signed, verifiable result. Without it the check runs locally and the result is not signed.
        </p>
      )}
      {step !== "running" && (
        <button className="btn primary" onClick={() => void run()}>
          {step === "intro" ? "Start check (about 6 seconds)" : "Run again"}
        </button>
      )}
      {step === "running" && !tint && <p>Preparing camera…</p>}
      {step === "error" && <div className="alert error">{message}</div>}
      {step === "done" && result && (
        <div className={`alert ${result.passed ? "ok" : "error"}`}>
          <strong>{result.passed ? "Verified live" : "Not verified"}</strong> · correlation {result.score.toFixed(2)}, delay {result.lagMs} ms, {result.samples} frames
          {result.reason ? ` · ${result.reason}` : ""}
          {!result.passed && <div className="muted">Try facing the screen in a dimmer room, closer to the display.</div>}
        </div>
      )}
      {attestation && (
        <div className="card">
          <h3>Signed attestation</h3>
          <p className="muted">Anyone can check this with the public key at /liveness/keys. Keep it with your recording.</p>
          <button className="btn small" onClick={() => downloadBlob(new Blob([JSON.stringify(attestation, null, 2)], { type: "application/json" }), "promptsense-liveness.json")}>
            Download attestation
          </button>
        </div>
      )}
    </main>
  );
}
