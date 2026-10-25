import { expect, test, type Page } from "@playwright/test";

/**
 * Full user flow with Chromium's fake camera/microphone and a scripted speech
 * source (window.__promptsenseSpeak), so voice-following is deterministic.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptsenseFakeSpeech = true;
    // These tests start after the setup tour (covered in tour.spec.ts).
    if (!localStorage.getItem("promptsense.settings.v1")) localStorage.setItem("promptsense.settings.v1", JSON.stringify({ onboarded: true }));
  });
});

async function speak(page: Page, text: string) {
  const words = text.split(" ");
  for (let i = 1; i <= words.length; i++) {
    await page.evaluate((t) => window.__promptsenseSpeak?.(t, false), words.slice(0, i).join(" "));
    await page.waitForTimeout(40);
  }
  await page.evaluate((t) => window.__promptsenseSpeak?.(t, true), text);
}

test("sample script: voice-following, pause, finish and report", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await expect(page.getByLabel("Title")).toHaveValue(/Sample/);
  await page.getByRole("button", { name: "Start prompting" }).click();

  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".chip", { hasText: "mic: listening" })).toBeVisible();

  const content = page.locator(".content");
  const before = await content.evaluate((el) => el.style.transform);

  await speak(page, "hi I'm testing JOTR a teleprompter that listens as I speak");
  await expect(page.locator(".w.current")).toHaveText("speak.");
  await speak(page, "when I pause it waits for me when I skip ahead it follows");
  await speak(page, "the script scrolls to keep my current line near the camera");
  await expect(page.locator(".w.current")).toHaveText("camera,");
  await expect.poll(() => content.evaluate((el) => el.style.transform)).not.toBe(before);
  await expect(page.locator(".w.spoken").first()).toBeVisible();

  // Skipping a whole section is followed once confirmed.
  await speak(page, "thanks for watching after this take I'll check the coach report");
  await expect(page.locator(".w.current")).toHaveText("report");

  // Off-script talk does not move the cursor.
  await speak(page, "oops sorry about that one second please");
  await expect(page.locator(".w.current")).toHaveText("report");

  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toContainText("Paused");
  await page.keyboard.press("Space");

  await page.getByTestId("stop").click();
  await expect(page.getByTestId("report")).toBeVisible();
  await expect(page.getByText("Pace", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Script review" })).toBeVisible();

  // The session appears in the library.
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Report" })).toBeVisible();
});

test("manual mode scrolls with the keyboard and the editor saves", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "New script" }).click();
  await page.getByLabel("Title").fill("Keyboard test");
  await page.getByLabel("Script").fill(Array.from({ length: 40 }, (_, i) => `Line number ${i + 1} of the script.`).join("\n\n"));
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByLabel("Scroll mode").selectOption("manual");
  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeVisible({ timeout: 10_000 });
  const content = page.locator(".content");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await expect.poll(() => content.evaluate((el) => el.style.transform)).toMatch(/translate3d\(0px, -\d+/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("report")).toBeVisible();
});

test("vision models load from our own origin under the production CSP", async ({ page }) => {
  const external: string[] = [];
  const cspErrors: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost") external.push(r.url());
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByTestId("start").click();
  // The fake camera shows no face, so the vision chip settles on "no face" once models are loaded.
  await expect(page.locator(".chip", { hasText: /no face|face$/ })).toBeVisible({ timeout: 45_000 });
  expect(external).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test("a trained ONNX stumble model is picked up when deployed", async ({ page }) => {
  const fixtures = new URL("./fixtures/", import.meta.url);
  const fs = await import("node:fs/promises");
  await page.route("**/models/stumble.json", async (route) =>
    route.fulfill({ contentType: "application/json", body: await fs.readFile(new URL("stumble.json", fixtures)) }),
  );
  await page.route("**/models/stumble.onnx", async (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: await fs.readFile(new URL("stumble.onnx", fixtures)) }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("prompter")).toHaveAttribute("data-predictor", /^gru-/, { timeout: 20_000 });
});

test("multilingual: a Hinglish script follows Hindi speech in Devanagari, and scrolling glides", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "New script" }).click();
  await page.getByLabel("Title").fill("Hinglish");
  const lines = [
    "Namaste doston, aap sab kaise ho?",
    "Aaj hum apni nayi meeting ke baare mein baat karenge.",
    "Pehle main project ka plan bataunga, phir team ke sawal lenge.",
    "Yeh demo bilkul live hai aur JOTR meri awaaz ke saath chal raha hai.",
  ];
  await page.getByLabel("Script").fill(Array.from({ length: 4 }, () => lines.join(" ")).join("\n\n"));
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeVisible({ timeout: 10_000 });

  // Record every scroll offset while speaking: a smooth glide has many small moves, not a few line jumps.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".content")!;
    const ys: Array<[number, number]> = [];
    (window as unknown as { __ys: typeof ys }).__ys = ys;
    const tick = (t: number) => {
      const m = /translate3d\(0px, (-?[\d.]+)px/.exec(el.style.transform);
      if (m) ys.push([t, Number(m[1])]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await speak(page, "नमस्ते दोस्तों आप सब कैसे हो");
  await expect(page.locator(".w.current")).toHaveText("ho?");
  await speak(page, "आज हम अपनी नई मीटिंग के बारे में बात करेंगे");
  await expect(page.locator(".w.current")).toHaveText("karenge.");
  await speak(page, "पहले मैं प्रोजेक्ट का प्लान बताऊंगा फिर टीम के सवाल लेंगे");
  await expect(page.locator(".w.current")).toHaveText("lenge.");
  await page.waitForTimeout(800);

  const samples = await page.evaluate(() => (window as unknown as { __ys: Array<[number, number]> }).__ys);
  const ys = samples.map(([, y]) => y);
  const moved = ys.filter((y, i) => i > 0 && y !== ys[i - 1]!);
  // Movement per 60 fps frame: a stalled main thread makes one frame cover several, which is not a jump.
  const steps = samples.slice(1).map(([t, y], i) => Math.abs(y - samples[i]![1]) / Math.max(1, (t - samples[i]![0]) / 16.7));
  const lineHeight = await page.locator(".content").evaluate((el) => parseFloat(getComputedStyle(el).fontSize) * 1.45);
  expect(Math.min(...ys)).toBeLessThan(-20); // it scrolled
  expect(moved.length).toBeGreaterThan(30); // in many small frames
  expect(Math.max(...steps)).toBeLessThan(lineHeight * 0.6); // never jumps a line at a time
});

test("recording shows the camera behind the text, and downloading shows a thumbnail of the saved video", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByLabel(/Record this take/).check();
  await expect(page.getByLabel(/Show me behind the text/)).toBeChecked();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cam.backdrop")).toBeVisible();
  // The camera shows like a mirror by default; "Mirror video" flips it back.
  const mirrorVideo = page.getByRole("button", { name: "Mirror video" });
  await expect(mirrorVideo).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(400, 400);
  await mirrorVideo.click();
  await expect(page.locator(".cam.backdrop.unmirrored")).toBeVisible();
  await mirrorVideo.click();
  await expect(page.locator(".cam.backdrop.unmirrored")).toHaveCount(0);
  await speak(page, "hi I'm testing JOTR a teleprompter that listens as I speak");
  await page.waitForTimeout(1500);
  await page.getByTestId("stop").click();
  await expect(page.getByTestId("report")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download video" }).click();
  expect((await download).suggestedFilename()).toMatch(/^JOTR Sample.*\.(webm|mp4)$/);
  const toast = page.getByTestId("saved-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Video saved");
  await expect(toast.locator("img")).toBeVisible({ timeout: 6000 });
  await toast.getByRole("button", { name: "Play the saved video" }).click();
  await expect(page.getByRole("dialog", { name: "Saved video" }).locator("video")).toBeVisible();
});
