import { predictGaze, OneEuroFilter } from "@promptsense/core";
import { useEffect, useRef, useState } from "react";
import { describeAccuracy, runCalibration, targetsForFrame, type CalibrationResult, type Target } from "../lib/calibration";
import { focusFrame } from "../lib/device";
import { getSettings, updateSettings } from "../lib/settings";

interface Props {
  /** Latest face features from the running vision engine. */
  latest: () => { t: number; vector: number[] } | null;
  onDone: (r: CalibrationResult & { quality: ReturnType<typeof describeAccuracy> }) => void;
  onError: (message: string) => void;
}

/**
 * Runs calibration with an animated target, then shows a live gaze cursor for
 * a few seconds so the user can see how well it tracks before continuing.
 */
export function CalibrationStage({ latest, onDone, onError }: Props) {
  const [dot, setDot] = useState<{ t: Target; phase: "approach" | "collect" | "done"; index: number; total: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const abort = new AbortController();
    const s = getSettings();
    const frame = focusFrame({ placement: s.cameraPlacement, fontSize: s.fontSize, lines: s.focusLines, columnWidth: s.columnWidth });
    runCalibration(targetsForFrame(frame), {
      showDot: (t, phase, index, total) => setDot(t ? { t, phase, index, total } : null),
      latest,
      hint: setHint,
      signal: abort.signal,
    })
      .then(async (r) => {
        updateSettings({ gazeModel: r.model, calibrationSamples: r.samples });
        // Live check: a soft cursor follows your eyes for 2.5 s.
        const fx = new OneEuroFilter(0.8, 0.03);
        const fy = new OneEuroFilter(0.8, 0.03);
        const end = performance.now() + 2500;
        while (performance.now() < end && !abort.signal.aborted) {
          const f = latest();
          if (f) {
            const g = predictGaze(r.model, f.vector);
            if (Number.isFinite(g.x)) setCursor({ x: fx.filter(g.x, f.t), y: fy.filter(g.y, f.t) });
          }
          await new Promise((res) => setTimeout(res, 33));
        }
        setCursor(null);
        onDone({ ...r, quality: describeAccuracy(r.errorPx, frame.lineHeight) });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") onError(e.message);
      });
    return () => abort.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {dot && (
        <div
          key={`${dot.index}`}
          className={`calib-target ${dot.phase}`}
          style={{ left: `${dot.t.x * 100}%`, top: `${dot.t.y * 100}%` }}
          data-testid="calib-dot"
        >
          <span className="ring" />
          <span className="core" />
        </div>
      )}
      {dot && (
        <div className="calib-progress" aria-live="polite">
          <div className="bar">
            <span style={{ width: `${Math.round(((dot.index + (dot.phase === "done" ? 1 : 0.5)) / dot.total) * 100)}%` }} />
          </div>
          <div className="label">{hint ?? "Follow the dot with your eyes, keep your head still"}</div>
        </div>
      )}
      {cursor && (
        <>
          <div className="gaze-cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} />
          <div className="calib-progress">
            <div className="label">Look around the text area: the glow follows your eyes</div>
          </div>
        </>
      )}
    </>
  );
}
