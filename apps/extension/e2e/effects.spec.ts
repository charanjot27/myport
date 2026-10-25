import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test.beforeAll(async () => {
  await build({ entryPoints: [join(here, "harness.ts")], bundle: true, format: "iife", outfile: join(here, "site/harness.js"), logLevel: "error" });
});

test("corneal shield and eye warp change only the eye regions", async ({ page }) => {
  await page.goto("http://localhost:4300/effects.html");
  const r = await page.evaluate(async () => {
    const v = document.getElementById("v") as HTMLVideoElement;
    v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await v.play();
    await new Promise((res) => setTimeout(res, 500));
    // Freeze a frame so every pass sees identical input.
    const still = document.createElement("canvas");
    still.width = v.videoWidth;
    still.height = v.videoHeight;
    still.getContext("2d")!.drawImage(v, 0, 0);
    // Paint high-contrast stripes where the "eyes" are, so blur and warp are visible.
    const sctx = still.getContext("2d")!;
    // Horizontal stripes: the eye-contact warp shifts vertically, the blur smears both ways.
    for (let y = 180; y < 240; y += 4) {
      sctx.fillStyle = y % 8 ? "#fff" : "#000";
      sctx.fillRect(0, y, still.width, 2);
    }
    const stream = still.captureStream(30);
    const v2 = document.createElement("video");
    v2.muted = true;
    v2.srcObject = stream;
    await v2.play();
    await new Promise((res) => setTimeout(res, 200));

    const VP = (window as any).VideoProcessor;
    const p = new VP();
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.9, z: 0 }));
    // Eye A around (0.35, 0.44), eye B around (0.65, 0.44); iris centres and edges.
    const set = (i: number, x: number, y: number) => (lm[i] = { x, y, z: 0 });
    set(33, 0.29, 0.44); set(133, 0.41, 0.44); set(468, 0.35, 0.44); set(469, 0.365, 0.44);
    set(263, 0.71, 0.44); set(362, 0.59, 0.44); set(473, 0.65, 0.44); set(474, 0.665, 0.44);

    const grab = (opts: any) => {
      p.process(v2, opts);
      const c = document.createElement("canvas");
      c.width = p.canvas.width;
      c.height = p.canvas.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(p.canvas, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const diff = (a: ImageData, b: ImageData, x0: number, y0: number, x1: number, y1: number) => {
      let d = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * a.width + x) * 4;
        d += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      }
      return d / ((x1 - x0) * (y1 - y0));
    };
    const base = grab({ landmarks: null, eyeContact: 0, shield: false });
    const shield = grab({ landmarks: lm, eyeContact: 0, shield: true });
    const warp = grab({ landmarks: lm, eyeContact: 1, shield: false });
    const W = base.width, H = base.height;
    const eye = [Math.round(0.33 * W), Math.round(0.42 * H), Math.round(0.37 * W), Math.round(0.46 * H)] as const;
    const far = [10, 10, 60, 60] as const;
    return {
      supported: p.supported,
      shieldEye: diff(base, shield, ...eye),
      shieldFar: diff(base, shield, ...far),
      warpEye: diff(base, warp, ...eye),
      warpFar: diff(base, warp, ...far),
    };
  });
  expect(r.supported).toBe(true);
  expect(r.shieldEye).toBeGreaterThan(20);
  expect(r.shieldFar).toBeLessThan(1);
  expect(r.warpEye).toBeGreaterThan(5);
  expect(r.warpFar).toBeLessThan(1);
});
