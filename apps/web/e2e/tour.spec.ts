import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptsenseFakeSpeech = true;
  });
});

test("first visit runs the setup tour end to end", async ({ page }) => {
  const started = Date.now();
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: "Set up in under a minute" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // 1. Camera and mic. Chromium's fake camera shows no face, so only "Skip this step" moves on.
  await page.getByRole("button", { name: "Allow camera & mic" }).click();
  await expect(page.getByText(/Looking for your face/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "Skip this step" }).click();

  // 2. Device detection and camera position.
  await expect(page.getByTestId("device-summary")).toContainText(/fake_device|camera/i);
  await page.getByRole("radio", { name: "Top right" }).click();
  await expect(page.getByRole("radio", { name: "Top right" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Top centre" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // 3. Reflection check refuses to guess without a face.
  await expect(page.getByText(/face wasn't visible/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.getByRole("button", { name: "Skip this step" }).click();

  // 4. Calibration can be skipped.
  await expect(page.getByRole("button", { name: "Start (8 s)" })).toBeVisible();
  await page.getByRole("button", { name: "Skip this step" }).click();

  // 5. Try it: the line under the camera dims as it is read.
  const line = page.getByTestId("try-text");
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.y).toBeLessThan(12); // right under a top camera
  expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(vw * 0.05);
  await page.evaluate(() => window.__promptsenseSpeak?.("this text sits right under my camera", true));
  await expect(line.locator("span").nth(5)).toHaveCSS("opacity", "0.42");
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Your scripts" })).toBeVisible();
  // The tour's own steps (excluding model loading on this CI machine) stay well under a minute.
  expect(Date.now() - started).toBeLessThan(60_000);
});

test("prompter places dim text in a small window under the camera", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("promptsense.settings.v1", JSON.stringify({ onboarded: true, textBrightness: 0.5 })));
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeAttached({ timeout: 10_000 });
  const win = page.getByTestId("text-window");
  const box = (await win.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeLessThan(12);
  expect(box.height).toBeLessThan(vp.height * 0.35);
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(vp.width * 0.05);
  // Text is dimmed to the configured brightness (warm tone at 50%).
  await expect(page.locator(".w").nth(10)).toHaveCSS("color", "rgb(128, 104, 75)");
  // No bright camera preview in this layout.
  await expect(page.locator(".cam")).toBeHidden();
  // Voice-following still scrolls inside the window.
  await page.evaluate(() => window.__promptsenseSpeak?.("hi I'm testing PromptSense a teleprompter that listens as I speak when I pause it waits for me", true));
  await expect(page.locator(".w.current")).toHaveText("me.");
});
