import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { FACE, faceFeatures, poseFromMatrix, type FaceFeatures, type Point3 } from "@promptsense/core";

/**
 * On-device perception: MediaPipe face mesh (with iris) every frame, hand
 * landmarks every other frame. Results are delivered as plain data so the
 * rest of the app never touches MediaPipe types.
 */

// Served from our own origin (scripts/fetch-models.mjs puts them in public/).
const ASSET_BASE = import.meta.env.VITE_MEDIAPIPE_BASE ?? `${import.meta.env.BASE_URL}mediapipe`;
const WASM_BASE = `${ASSET_BASE}/wasm`;
const FACE_MODEL = `${ASSET_BASE}/models/face_landmarker.task`;
const HAND_MODEL = `${ASSET_BASE}/models/hand_landmarker.task`;

export interface VisionFrame {
  t: number;
  face: {
    landmarks: Point3[];
    features: FaceFeatures;
    /** Blink scores from MediaPipe blendshapes (0..1), when available. */
    blinkScore: number;
  } | null;
  hand: Point3[] | null;
  /** Mean RGB of the two cheek patches, for the liveness check. */
  skin: [number, number, number] | null;
  /** Milliseconds spent on inference for this frame. */
  inferenceMs: number;
}

export interface VisionOptions {
  hands: boolean;
  skin: boolean;
}

export class VisionEngine {
  private face: FaceLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;
  private frameCount = 0;
  private lastHand: Point3[] | null = null;
  private lastVideoTime = -1;
  private skinCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private rafHandle = 0;
  onFrame: ((f: VisionFrame) => void) | null = null;
  options: VisionOptions = { hands: false, skin: false };

  private delegate: "GPU" | "CPU" = "GPU";
  private fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private loading: Promise<void> | null = null;

  /** Load models once; concurrent callers share the same promise. */
  load(opts: { hands: boolean }): Promise<void> {
    this.loading ??= this.doLoad().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading.then(() => (opts.hands ? this.enableHands() : undefined));
  }

  private async doLoad(): Promise<void> {
    this.fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(this.fileset!, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    try {
      this.face = await create("GPU");
    } catch (e) {
      // No WebGL2 / GPU blocklisted: the CPU path is slower but works everywhere.
      console.warn("GPU delegate unavailable, using CPU", e);
      this.delegate = "CPU";
      this.face = await create("CPU");
    }
  }

  get loaded(): boolean {
    return this.face !== null;
  }

  async enableHands(): Promise<void> {
    if (this.hands) return;
    this.fileset ??= await FilesetResolver.forVisionTasks(WASM_BASE);
    this.hands = await HandLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: this.delegate },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }

  start(video: HTMLVideoElement): void {
    this.video = video;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.video && "cancelVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.rafHandle);
    (this.video?.ownerDocument.defaultView ?? window).cancelAnimationFrame(this.rafHandle);
  }

  dispose(): void {
    this.stop();
    this.face?.close();
    this.hands?.close();
    this.face = null;
    this.hands = null;
    this.loading = null;
  }

  private schedule(): void {
    const v = this.video;
    if (!this.running || !v) return;
    const el = v as HTMLVideoElement;
    if ("requestVideoFrameCallback" in el) {
      this.rafHandle = el.requestVideoFrameCallback(() => this.process());
    } else {
      // The video may live in a floating Picture-in-Picture document; use that window's frames.
      this.rafHandle = ((el as HTMLVideoElement).ownerDocument.defaultView ?? window).requestAnimationFrame(() => this.process());
    }
  }

  private process(): void {
    const v = this.video;
    if (!this.running || !v || !this.face) return;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const t = performance.now();
      let faceRes: FaceLandmarkerResult | null = null;
      let handRes: HandLandmarkerResult | null = null;
      try {
        faceRes = this.face.detectForVideo(v, t);
        if (this.options.hands && this.hands && this.frameCount % 2 === 0) {
          handRes = this.hands.detectForVideo(v, t);
          this.lastHand = (handRes.landmarks[0] as Point3[] | undefined) ?? null;
        }
      } catch (e) {
        console.warn("vision inference failed", e);
      }
      this.frameCount++;
      const inferenceMs = performance.now() - t;
      const frame = this.toFrame(t, faceRes, v);
      frame.inferenceMs = inferenceMs;
      this.onFrame?.(frame);
    }
    this.schedule();
  }

  private toFrame(t: number, res: FaceLandmarkerResult | null, v: HTMLVideoElement): VisionFrame {
    const lm = res?.faceLandmarks[0] as Point3[] | undefined;
    if (!lm) return { t, face: null, hand: this.options.hands ? this.lastHand : null, skin: null, inferenceMs: 0 };
    const matrix = res?.facialTransformationMatrixes?.[0]?.data;
    const pose = matrix ? poseFromMatrix(matrix) : undefined;
    const features = faceFeatures(lm, pose);
    const shapes = res?.faceBlendshapes?.[0]?.categories ?? [];
    const blinkL = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
    const blinkR = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
    const blinkScore = Math.max(blinkL, blinkR);
    if (features && blinkScore > 0.5) features.blink = true;
    return {
      t,
      face: features ? { landmarks: lm, features, blinkScore } : null,
      hand: this.options.hands ? this.lastHand : null,
      skin: this.options.skin ? this.sampleSkin(v, lm) : null,
      inferenceMs: 0,
    };
  }

  /** Average colour of small patches on both cheeks (downscaled frame keeps this cheap). */
  private sampleSkin(v: HTMLVideoElement, lm: Point3[]): [number, number, number] | null {
    const w = 320;
    const h = Math.round((w * v.videoHeight) / (v.videoWidth || 1)) || 240;
    if (!this.skinCanvas) {
      this.skinCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    }
    const ctx = this.skinCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const sum = [0, 0, 0];
    let n = 0;
    for (const idx of [FACE.cheekA, FACE.cheekB]) {
      const p = lm[idx];
      if (!p) continue;
      const x = Math.round(p.x * w) - 3;
      const y = Math.round(p.y * h) - 3;
      if (x < 0 || y < 0 || x + 6 > w || y + 6 > h) continue;
      const data = ctx.getImageData(x, y, 6, 6).data;
      for (let i = 0; i < data.length; i += 4) {
        sum[0]! += data[i]!;
        sum[1]! += data[i + 1]!;
        sum[2]! += data[i + 2]!;
        n++;
      }
    }
    return n ? [sum[0]! / n, sum[1]! / n, sum[2]! / n] : null;
  }
}

let shared: VisionEngine | null = null;
/** One engine per page: model loading is the slow part, so reuse it across views. */
export function sharedVision(): VisionEngine {
  shared ??= new VisionEngine();
  return shared;
}
