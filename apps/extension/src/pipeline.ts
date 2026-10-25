import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { faceFeatures, ReadingGate, readingFeatures, readingProbability, type GazeSample, type Point3 } from "@promptsense/core";
import { VideoProcessor } from "@promptsense/core/browser";

export interface EffectSettings {
  enabled: boolean;
  shield: boolean;
  eyeContact: boolean;
  /** Strength of the eye-contact shift as a fraction of eye width. */
  strength: number;
}

export const DEFAULT_EFFECTS: EffectSettings = { enabled: true, shield: true, eyeContact: true, strength: 0.09 };

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function landmarker(assetBase: string): Promise<FaceLandmarker> {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(`${assetBase}/wasm`);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${assetBase}/models/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  return landmarkerPromise;
}

/**
 * Wraps a camera track: frames go through face tracking and the GPU effects,
 * and the call app receives the processed canvas instead of the raw camera.
 * Without calibration we judge "reading" from eye-in-head movement (iris
 * position relative to the eye corners), which still shows the reading rhythm
 * of short forward saccades and return sweeps.
 */
export class CameraPipeline {
  private readonly video = document.createElement("video");
  private readonly processor = new VideoProcessor();
  private readonly gate = new ReadingGate();
  private readonly history: GazeSample[] = [];
  private landmarks: Point3[] | null = null;
  private running = false;
  private lastT = 0;
  private lastVideoTime = -1;
  readonly output: MediaStreamTrack;

  constructor(
    private readonly source: MediaStreamTrack,
    private settings: EffectSettings,
    private readonly assetBase: string,
  ) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([source]);
    const fps = source.getSettings().frameRate ?? 30;
    this.output = this.processor.canvas.captureStream(fps).getVideoTracks()[0]!;
    // Stopping the processed track (call app hangs up) releases the real camera.
    const stop = this.output.stop.bind(this.output);
    this.output.stop = () => {
      this.stop();
      stop();
    };
    source.addEventListener("ended", () => this.stop());
  }

  get supported(): boolean {
    return this.processor.supported;
  }

  update(settings: EffectSettings): void {
    this.settings = settings;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.video.play();
    let face: FaceLandmarker | null = null;
    landmarker(this.assetBase)
      .then((f) => (face = f))
      .catch((e) => console.warn("[JOTR] face tracking unavailable, passing video through", e));

    const loop = () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = v.currentTime;
        const now = performance.now();
        let blink = false;
        if (face && this.settings.enabled) {
          const res = face.detectForVideo(v, now);
          this.landmarks = (res.faceLandmarks[0] as Point3[] | undefined) ?? null;
          const feats = this.landmarks ? faceFeatures(this.landmarks) : null;
          const shapes = res.faceBlendshapes?.[0]?.categories ?? [];
          blink = (feats?.blink ?? false) || shapes.some((c) => c.categoryName.startsWith("eyeBlink") && c.score > 0.5);
          if (feats) {
            // Eye-in-head coordinates, scaled so typical reading saccades are a few percent of the range.
            this.history.push({ t: now, x: (feats.vector[0]! - 0.5) * 4 + 0.5, y: feats.vector[1]! * 4 + 0.5, valid: !blink, blink, yaw: feats.pose.yaw, pitch: feats.pose.pitch });
          }
          while (this.history.length && this.history[0]!.t < now - 1500) this.history.shift();
        }
        let weight = 0;
        if (this.settings.enabled && this.settings.eyeContact && this.landmarks) {
          const p = readingProbability(readingFeatures(this.history, { x0: -1, y0: -1, x1: 2, y1: 2 }));
          weight = this.gate.update(p, now - this.lastT, blink);
        }
        this.lastT = now;
        this.processor.process(v, {
          landmarks: this.settings.enabled ? this.landmarks : null,
          eyeContact: weight,
          shield: this.settings.enabled && this.settings.shield,
          shiftFraction: this.settings.strength,
        });
      }
      if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.source.stop();
    this.video.srcObject = null;
  }
}
