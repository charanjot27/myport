import { FEATURE_COUNT, STUMBLE_SPEC, type StumblePredictor } from "@promptsense/core";

/**
 * Trained GRU stumble predictor exported from ml/ as ONNX. Input "features"
 * is [1, WINDOW, FEATURE_COUNT] float32; output "risk" is [1] probability.
 * Loaded lazily; when the model file is absent the heuristic stays in use.
 */
export class OnnxStumblePredictor implements StumblePredictor {
  readonly name: string;
  private constructor(
    private readonly session: import("onnxruntime-web/wasm").InferenceSession,
    private readonly ort: typeof import("onnxruntime-web/wasm"),
    version: string,
  ) {
    this.name = `gru-${version}`;
  }

  static async load(url = `${import.meta.env.BASE_URL}models/stumble.onnx`): Promise<OnnxStumblePredictor | null> {
    try {
      const meta = await fetch(url.replace(/\.onnx$/, ".json"));
      // An SPA host answers unknown paths with index.html, so check the type too.
      if (!meta.ok || !meta.headers.get("content-type")?.includes("json")) return null;
      const info = (await meta.json()) as { version: string; spec: { features: string[]; window: number } };
      if (info.spec.window !== STUMBLE_SPEC.window || info.spec.features.join() !== STUMBLE_SPEC.features.join()) {
        console.warn("stumble model was trained on a different feature spec; ignoring it");
        return null;
      }
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}onnx/`;
      const session = await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
      return new OnnxStumblePredictor(session, ort, info.version);
    } catch (e) {
      console.warn("could not load stumble model", e);
      return null;
    }
  }

  async predict(window: Float32Array[]): Promise<number> {
    const data = new Float32Array(STUMBLE_SPEC.window * FEATURE_COUNT);
    window.slice(-STUMBLE_SPEC.window).forEach((f, i) => data.set(f, i * FEATURE_COUNT));
    const input = new this.ort.Tensor("float32", data, [1, STUMBLE_SPEC.window, FEATURE_COUNT]);
    const out = await this.session.run({ features: input });
    const risk = out.risk?.data as Float32Array | undefined;
    return risk?.[0] ?? 0;
  }
}
