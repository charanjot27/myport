import { chromium, expect, test } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");

test("call pages get a processed camera track and untouched audio", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  try {
    const page = await context.newPage();
    const logs: string[] = [];
    page.on("console", (m) => logs.push(m.text()));
    await page.goto("http://localhost:4300/call.html");
    const result = await page.evaluate(() => (window as unknown as { callResult: Promise<unknown> }).callResult);
    const r = result as { tracks: Array<{ kind: string; label: string; state: string }>; litPixels: number; size: number[] };
    const video = r.tracks.find((t) => t.kind === "video")!;
    const audio = r.tracks.find((t) => t.kind === "audio")!;
    // The fake camera's track is labelled "fake_device_0"; a canvas capture track is not.
    expect(video.label).not.toMatch(/fake/i);
    expect(video.state).toBe("live");
    expect(audio.label).toMatch(/fake/i);
    expect(r.litPixels).toBeGreaterThan(100);
    expect(r.size[0]).toBeGreaterThan(0);
    expect(logs.filter((l) => l.includes("could not process"))).toEqual([]);
  } finally {
    await context.close();
  }
});
