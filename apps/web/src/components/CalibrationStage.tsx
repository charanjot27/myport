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
 * Runs the fast calibration over the camera-layout text column and saves the
 * model. Renders only the dot (on black); the caller supplies the camera.
 */
export function CalibrationStage({ latest, onDone, onError }: Props) {
  const [dot, setDot] = useState<{ t: Target; collecting: boolean } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const abort = new AbortController();
    const s = getSettings();
    const frame = focusFrame({ placement: s.cameraPlacement, fontSize: s.fontSize, lines: s.focusLines, columnWidth: s.columnWidth });
    runCalibration(targetsForFrame(frame), {
      showDot: (t, collecting) => setDot(t ? { t, collecting } : null),
      latest,
      signal: abort.signal,
    })
      .then((r) => {
        updateSettings({ gazeModel: r.model, calibrationSamples: r.samples });
        onDone({ ...r, quality: describeAccuracy(r.errorPx, frame.lineHeight) });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") onError(e.message);
      });
    return () => abort.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return dot ? (
    <div className={`calib-dot${dot.collecting ? " collect" : ""}`} style={{ left: `${dot.t.x * 100}%`, top: `${dot.t.y * 100}%` }} data-testid="calib-dot" />
  ) : null;
}
