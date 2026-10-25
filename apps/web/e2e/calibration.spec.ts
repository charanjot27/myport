import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptsenseFakeSpeech = true;
  });
});

// Regression: in development mode React mounts components twice; the dot used to freeze on the first point.
test("calibration dot moves through the points", async ({ page }) => {
  // Loads the face model and waits out two "no face" checks; that is slow on CI machines without a GPU.
  test.slow();
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Allow camera & mic" }).click();
  await expect(page.getByText(/Looking for your face/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/face wasn't visible/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Skip this step" }).click();
  await page.getByRole("button", { name: "Start (8 s)" }).click();

  const positions = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const style = await page.getByTestId("calib-dot").getAttribute("style").catch(() => null);
    if (style) positions.add(style);
    await page.waitForTimeout(200);
  }
  expect(positions.size).toBeGreaterThanOrEqual(3);
});
