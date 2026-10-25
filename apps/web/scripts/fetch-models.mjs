// Copies the MediaPipe WASM runtime out of node_modules and downloads the
// face/hand landmark models into public/, so production serves them from the
// app's own origin (no third-party CDN at runtime). Safe to re-run.
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");
const modelDst = join(root, "public/mediapipe/models");

const MODELS = {
  "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "hand_landmarker.task": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

if (!(await exists(join(wasmSrc, "vision_wasm_internal.wasm")))) {
  console.error("\nDependencies are not installed yet. Run `pnpm install` in the promptsense folder, then try again.\n");
  process.exit(1);
}

await mkdir(wasmDst, { recursive: true });
await mkdir(modelDst, { recursive: true });
for (const f of await readdir(wasmSrc)) await copyFile(join(wasmSrc, f), join(wasmDst, f));

// ONNX Runtime (wasm backend only) for the trained stumble predictor.
const ortSrc = join(root, "node_modules/onnxruntime-web/dist");
const ortDst = join(root, "public/onnx");
await mkdir(ortDst, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) await copyFile(join(ortSrc, f), join(ortDst, f));

for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(modelDst, name);
  if (await exists(dst)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await writeFile(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${name}`);
}
console.log("mediapipe assets ready");
