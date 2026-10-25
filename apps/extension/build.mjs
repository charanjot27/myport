// Bundles the extension into dist/. `--test` also matches http://localhost so
// Playwright can exercise the injector on a local page.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const test = process.argv.includes("--test");
// Where the JOTR web app lives; the popup opens it and the site script marks it as "extension installed".
const siteOrigin = (process.env.JOTR_SITE_ORIGIN || "http://localhost:5173").replace(/\/$/, "");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: { inject: "src/inject.ts", bridge: "src/bridge.ts", popup: "src/popup.ts", site: "src/site.ts" },
  define: { __JOTR_SITE__: JSON.stringify(siteOrigin) },
  bundle: true,
  format: "iife",
  target: "chrome116",
  outdir: dist,
  absWorkingDir: root,
  minify: !test,
  sourcemap: test ? "inline" : false,
  legalComments: "none",
});

await cp(join(root, "static/icons"), join(dist, "icons"), { recursive: true });
await cp(join(root, "static/popup.html"), join(dist, "popup.html"));

// MediaPipe runtime and face model, shared with the web app's fetched assets.
const web = join(root, "../web/public/mediapipe");
await mkdir(join(dist, "mediapipe/wasm"), { recursive: true });
await mkdir(join(dist, "mediapipe/models"), { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  await cp(join(root, "node_modules/@mediapipe/tasks-vision/wasm", f), join(dist, "mediapipe/wasm", f));
}
try {
  await cp(join(web, "models/face_landmarker.task"), join(dist, "mediapipe/models/face_landmarker.task"));
} catch {
  throw new Error("Face model missing: run `pnpm --filter @promptsense/web assets` first.");
}

const manifest = JSON.parse(await readFile(join(root, "static/manifest.json"), "utf8"));
if (test) {
  for (const cs of manifest.content_scripts) cs.matches.push("http://localhost/*");
  manifest.web_accessible_resources[0].matches.push("http://localhost/*");
}
// The site script runs on the JOTR app (and local development servers).
// Store builds only list the real site; local builds also match development servers.
const local = process.env.JOTR_STORE ? [] : ["http://localhost/*", "http://127.0.0.1/*"];
const siteMatches = [...new Set([`${siteOrigin}/*`, ...local].map((m) => m.replace(/:\d+\/\*$/, "/*")))];
manifest.content_scripts.push({ matches: siteMatches, js: ["site.js"], run_at: "document_start" });
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`extension built in ${dist}${test ? " (test build)" : ""}`);
