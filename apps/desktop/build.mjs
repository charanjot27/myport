// Bundles JOTR Desktop into dist/: the main process, the preload bridge and the two windows.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "renderer"), { recursive: true });

const common = { bundle: true, absWorkingDir: root, legalComments: "none", minify: process.argv.includes("--minify") };
await build({ ...common, entryPoints: { main: "src/main.ts", preload: "src/preload.ts" }, outdir: dist, platform: "node", format: "cjs", target: "node22", external: ["electron", "bufferutil", "utf-8-validate"] });
await build({ ...common, entryPoints: { notch: "src/renderer/notch.ts", control: "src/renderer/control.ts" }, outdir: join(dist, "renderer"), platform: "browser", format: "iife", target: "chrome130" });
for (const f of ["notch.html", "notch.css", "control.html", "control.css"]) await cp(join(root, "src/renderer", f), join(dist, "renderer", f));
// The listener page runs in the user's Chrome (served by the app on localhost).
await mkdir(join(dist, "listener"), { recursive: true });
await build({ ...common, entryPoints: { listen: "src/listener/listen.ts" }, outdir: join(dist, "listener"), platform: "browser", format: "iife", target: "chrome120" });
await cp(join(root, "src/listener/listen.html"), join(dist, "listener", "listen.html"));
await cp(join(root, "assets"), join(dist, "icons"), { recursive: true });
console.log("JOTR Desktop built in dist/");
