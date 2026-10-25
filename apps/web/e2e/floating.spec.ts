import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptsenseFakeSpeech = true;
    if (!localStorage.getItem("promptsense.settings.v1")) localStorage.setItem("promptsense.settings.v1", JSON.stringify({ onboarded: true }));
  });
});

test("floating prompter stays on top and keeps following speech while another tab is in front", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();

  const pipPromise = context.waitForEvent("page");
  await page.getByTestId("start-floating").click();
  const pip = await pipPromise;
  await expect(pip.getByTestId("floating-prompter")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Floating over your other tabs" })).toBeVisible();

  // Simulate working in a different site (e.g. a meeting) in another tab.
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.setContent("<h1>Some meeting</h1>");
  await other.bringToFront();

  // Speech is recognised from the floating window and the text there follows it.
  await page.evaluate(() => window.__promptsenseSpeak?.("hi I'm testing PromptSense a teleprompter that listens as I speak when I pause it waits for me", true));
  await expect(pip.locator(".w.current")).toHaveText("me.");
  await page.evaluate(() => window.__promptsenseSpeak?.("when I skip ahead it follows the script scrolls to keep my current line near the camera", true));
  await expect(pip.locator(".w.current")).toHaveText("camera,");
  // Scrolling is driven by the floating window's frames even though our tab is in the background.
  await expect.poll(() => pip.locator(".content").evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/translate3d\(0px, -\d+/);

  // Controls in the floating window work.
  await pip.getByTitle("Pause / resume (Space)").click();
  await expect(pip.locator(".pip-status")).toContainText("Paused");
  await pip.getByTitle("Pause / resume (Space)").click();

  // Bring it back into the tab, then float again from the toolbar.
  await pip.getByTitle("Bring the text back into the PromptSense tab").click();
  await expect(page.getByTestId("text-window")).toBeVisible();
  await expect(page.locator(".w.current")).toHaveText("camera,");

  await page.bringToFront();
  const pip2Promise = context.waitForEvent("page");
  await page.mouse.move(200, 200);
  await page.getByRole("button", { name: "⧉ Float over other tabs" }).click();
  const pip2 = await pip2Promise;
  await expect(pip2.getByTestId("floating-prompter")).toBeVisible();
  await pip2.getByTestId("pip-stop").click();
  await expect(page.getByTestId("report")).toBeVisible();
});
