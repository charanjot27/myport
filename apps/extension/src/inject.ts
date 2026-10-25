import { CameraPipeline, DEFAULT_EFFECTS, type EffectSettings } from "./pipeline";

/**
 * Runs in the page's MAIN world at document_start on supported call sites.
 * It wraps navigator.mediaDevices.getUserMedia so camera tracks the page asks
 * for are replaced by PromptSense-processed tracks. Audio is never touched.
 * Settings and the extension's asset URL arrive from the isolated-world
 * bridge (bridge.ts) via window.postMessage.
 */

const MESSAGE = "promptsense:effects";
let settings: EffectSettings = { ...DEFAULT_EFFECTS };
let assetBase = "";
const pipelines = new Set<CameraPipeline>();
const ready = new Promise<void>((resolve) => {
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== MESSAGE) return;
    settings = { ...DEFAULT_EFFECTS, ...(e.data.settings as Partial<EffectSettings>) };
    assetBase = e.data.assetBase as string;
    pipelines.forEach((p) => p.update(settings));
    resolve();
  });
});

const md = navigator.mediaDevices;
if (md?.getUserMedia) {
  const original = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = await original(constraints);
    if (!constraints?.video) return stream;
    // Wait briefly for settings; if the bridge is slow, use defaults.
    await Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]);
    if (!settings.enabled || !assetBase) return stream;
    try {
      const tracks: MediaStreamTrack[] = [];
      for (const track of stream.getTracks()) {
        if (track.kind !== "video") {
          tracks.push(track);
          continue;
        }
        const pipeline = new CameraPipeline(track, settings, assetBase);
        if (!pipeline.supported) {
          tracks.push(track);
          continue;
        }
        await pipeline.start();
        pipelines.add(pipeline);
        pipeline.output.addEventListener("ended", () => pipelines.delete(pipeline));
        tracks.push(pipeline.output);
      }
      return new MediaStream(tracks);
    } catch (e) {
      console.warn("[PromptSense] could not process the camera; using it unmodified", e);
      return stream;
    }
  };
}
