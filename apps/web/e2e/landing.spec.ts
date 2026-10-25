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

test("closer look: the 3D laptop loads and the pills switch views", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#look").scrollIntoViewIfNeeded();
  // WebGL scene (or the CSS laptop where WebGL is unavailable) appears under the production CSP.
  await expect(page.locator(".lg-look-canvas[data-ready], .lg-look-stage .lg-laptop")).toBeVisible();
  const notch = page.getByRole("tab", { name: /Under the camera/ });
  await notch.click();
  await expect(notch).toHaveAttribute("aria-selected", "true");
  await expect(notch).toContainText("no wider than the notch");
  await expect(page.getByRole("heading", { name: /Here’s what you get with JOTR/ })).toBeAttached();
  expect(errors).toEqual([]);
});

test("star statement reacts to the pointer and the language FAQ answers", async ({ page }) => {
  await page.goto("/");
  const section = page.locator(".lg-statement");
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Why JOTR" })).toBeVisible();
  const box = (await section.boundingBox())!;
  // The canvas repaints as the cursor pulls stars toward it.
  const snap = () => page.locator(".lg-stars").evaluate((c: HTMLCanvasElement) => c.toDataURL().length);
  const before = await snap();
  for (let i = 0; i < 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
  await expect.poll(snap).not.toBe(before);
  await page.getByText("Which languages can I speak?").click();
  await expect(page.getByText(/Devanagari, Gurmukhi or English letters/)).toBeVisible();
});
