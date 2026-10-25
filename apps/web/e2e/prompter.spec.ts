import { expect, test, type Page } from "@playwright/test";

/**
 * Full user flow with Chromium's fake camera/microphone and a scripted speech
 * source (window.__promptsenseSpeak), so voice-following is deterministic.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptsenseFakeSpeech = true;
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
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await expect(page.getByLabel("Title")).toHaveValue(/Sample/);
  await page.getByRole("button", { name: "Start prompting" }).click();

  await page.getByTestId("start").click();
  await expect(page.getByTestId("stop")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".chip", { hasText: "mic: listening" })).toBeVisible();

  const content = page.locator(".content");
  const before = await content.evaluate((el) => el.style.transform);

  await speak(page, "hi I'm testing PromptSense a teleprompter that listens as I speak");
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
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Report" })).toBeVisible();
});

test("manual mode scrolls with the keyboard and the editor saves", async ({ page }) => {
  await page.goto("/");
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

test("vision models load from our own origin", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost") external.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await page.getByTestId("start").click();
  // The fake camera shows no face, so the vision chip settles on "no face" once models are loaded.
  await expect(page.locator(".chip", { hasText: /no face|face$/ })).toBeVisible({ timeout: 45_000 });
  expect(external).toEqual([]);
});
