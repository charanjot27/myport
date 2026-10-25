import { expect, test } from "@playwright/test";

test("landing page: hero, demo popup and start", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/JOTR/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Look them in the eye.");
  // The notch demo animates words.
  await expect(page.locator(".lg-notch .now").first()).toBeVisible();

  // Demo popup expands into the step-by-step demo.
  await page.getByTestId("demo-mini").getByRole("button", { name: "Watch the demo" }).click();
  const dialog = page.getByRole("dialog", { name: "JOTR demo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Step 5/ }).click();
  await expect(dialog).toContainText("Floats over your meeting");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // FAQ opens.
  await page.getByText("I wear glasses. Will the text reflect in them?").click();
  await expect(page.getByText(/reflection check that measures your glasses/)).toBeVisible();

  // No fabricated social proof: the testimonials section is hidden until real quotes are added.
  await expect(page.getByText("What people say")).toHaveCount(0);

  await page.getByRole("link", { name: /Start free in your browser/ }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});
