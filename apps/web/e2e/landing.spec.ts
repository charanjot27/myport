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

test("the demo popup can be dragged to an edge and still opens on click", async ({ page }) => {
  await page.goto("/");
  const mini = page.getByTestId("demo-mini");
  await expect(mini).toBeVisible();
  const box = (await mini.boundingBox())!;
  const vp = page.viewportSize()!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - (i * (vp.width * 0.55)) / 10, box.y + box.height / 2 - i * 25);
  await page.mouse.up();
  // It glides to the left edge.
  await expect.poll(async () => (await mini.boundingBox())!.x).toBeLessThan(40);
  await page.reload();
  await expect.poll(async () => (await page.getByTestId("demo-mini").boundingBox())?.x ?? 999).toBeLessThan(40); // remembered
  await page.getByTestId("demo-mini").getByRole("button", { name: "Watch the demo" }).click();
  await expect(page.getByRole("dialog", { name: "JOTR demo" })).toBeVisible();
});

test("Add to Chrome opens the install guide, and shows Added once installed", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add to Chrome" }).first().click();
  const guide = page.getByRole("dialog", { name: "Add JOTR to Chrome" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("Load unpacked")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await ctx.addInitScript(() => {
    // What the extension's site script does (Chrome runs it once <html> exists).
    const mark = () => {
      document.documentElement.dataset.jotrExtension = "0.1.0";
      window.dispatchEvent(new CustomEvent("jotr:extension"));
    };
    if (document.documentElement) mark();
    else document.addEventListener("DOMContentLoaded", mark);
  });
  const p2 = await ctx.newPage();
  await p2.goto("/");
  await expect(p2.getByText("Added to Chrome").first()).toBeVisible();
  await ctx.close();
});

test("the user counter counts a new browser once and shows the total", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("promptsense.settings.v1")) localStorage.setItem("promptsense.settings.v1", JSON.stringify({ apiUrl: "/api" }));
  });
  await page.goto("/");
  const badge = page.getByTestId("user-count");
  await expect(badge).toContainText(/Welcome! You're user #\d+/);
  // The number counts up from 0; wait for it to land.
  const shown = async () => Number(((await badge.textContent()) ?? "").match(/#([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 0);
  await expect.poll(shown).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  const first = await shown();
  await page.reload();
  // Counted once: the same browser now sees the total, which includes it.
  await expect(badge).toContainText(/(people use|person uses) JOTR/);
  await expect.poll(async () => Number((await badge.textContent())!.match(/([\d,]+)\s+(people|person)/)?.[1]?.replace(/,/g, "") ?? 0)).toBeGreaterThanOrEqual(first);
});

test("desktop download buttons point at the latest release, own system first", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "Win32" }));
  await page.goto(test.info().project.use.baseURL + "/");
  const win = page.getByTestId("download-windows");
  await expect(win).toHaveAttribute("href", /releases\/latest\/download\/JOTR-windows-x64\.exe$/);
  await expect(page.getByTestId("download-mac")).toHaveAttribute("href", /JOTR-mac-(arm64|x64)\.dmg$/);
  // Windows visitors see the Windows button first.
  const first = await page.locator(".lg-downloads-row a").first().getAttribute("data-testid");
  expect(first).toBe("download-windows");
  await ctx.close();
});
