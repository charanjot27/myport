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
  await expect(badge).toContainText(/Welcome! You're user #\d+/, { timeout: 15_000 });
  // The number counts up from 0; wait for it to land.
  const shown = async () => Number(((await badge.textContent()) ?? "").match(/#([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 0);
  await expect.poll(shown).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  const first = await shown();
  await page.reload();
  // Counted once: the same browser now sees the total, which includes it.
  await expect(badge).toContainText(/(people use|person uses) JOTR/, { timeout: 15_000 });
  await expect.poll(async () => Number((await badge.textContent())!.match(/([\d,]+)\s+(people|person)/)?.[1]?.replace(/,/g, "") ?? 0)).toBeGreaterThanOrEqual(first);
});

test("desktop downloads point at the latest release, own system first", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "Win32" }));
  await page.goto(test.info().project.use.baseURL + "/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Download" }).click();
  // Windows visitors land on the Windows tab.
  await expect(page.getByRole("tab", { name: /Windows/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("download-windows")).toHaveAttribute("href", /releases\/latest\/download\/JOTR-windows-x64\.exe$/);
  await page.getByRole("tab", { name: /mac/i }).click();
  await expect(page.getByTestId("download-mac")).toHaveAttribute("href", /JOTR-mac-(arm64|x64)\.dmg$/);
  await ctx.close();
});

test("Mac visitors get a one-line install command they can copy", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "userAgentData", { get: () => ({ platform: "macOS", getHighEntropyValues: async () => ({ architecture: "arm" }) }) });
  });
  await page.goto("/");
  await page.locator("#get").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("download-mac")).toHaveAttribute("href", /JOTR-mac-arm64\.dmg$/); // Mac tab first, Apple Silicon file
  const cmd = page.getByTestId("mac-install-command");
  await expect(cmd).toHaveText(/^curl -fsSL https?:\/\/.+\/install\.sh \| sh$/);
  await expect(page.getByText(/Why macOS may say “JOTR is damaged”/)).toBeVisible(); // the reason comes first
  await expect(page.getByTestId("mac-unblock-command")).toHaveText("xattr -dr com.apple.quarantine /Applications/JOTR.app");
  await cmd.locator("xpath=..").getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/install\.sh \| sh$/);
  // The installer itself is served as a file, not the app's HTML.
  const sh = await page.request.get("/install.sh");
  expect(await sh.text()).toMatch(/^#!\/bin\/sh/);
  await ctx.close();
});

test("phones get the phone tab first, and the prompter hangs from the camera like a notch", async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    (window as unknown as { __promptsenseFakeSpeech: boolean }).__promptsenseFakeSpeech = true;
    localStorage.setItem("promptsense.settings.v1", JSON.stringify({ onboarded: true }));
  });
  await page.goto("/");
  await page.locator("#get").scrollIntoViewIfNeeded();
  await expect(page.getByRole("tab", { name: /iPhone & Android/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Add it to your Home Screen")).toBeVisible();
  // No horizontal scrolling on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.goto("/app");
  await page.getByRole("button", { name: "Try the sample script" }).click();
  await page.getByRole("button", { name: "Start prompting" }).click();
  await expect(page.locator(".prompter.phone .phone-notch")).toBeVisible();
  const box = (await page.getByTestId("text-window").boundingBox())!;
  expect(box.y).toBeLessThan(80); // right under the camera
  expect(box.width).toBeGreaterThan(330);
  await ctx.close();
});

test("navigation lives in the bottom dock, and the JOTR notch stays pinned at the top", async ({ page }) => {
  await page.goto("/");
  const dock = page.getByRole("navigation", { name: "Site" });
  await expect(dock).toBeVisible();
  await expect(page.locator("header.lg-nav")).toHaveCount(0); // nothing at the top but the notch

  const notch = page.locator(".lg-top-notch");
  const top0 = (await notch.boundingBox())!.y;
  await dock.getByRole("link", { name: "FAQ" }).click();
  await expect(page.locator("#faq")).toBeInViewport();
  await expect(dock.getByRole("link", { name: "FAQ" })).toHaveClass(/on/);
  expect((await notch.boundingBox())!.y).toBe(top0); // still pinned after scrolling

  await expect(dock.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", /github\.com\/charanjot27/);
  await dock.getByRole("link", { name: "Home" }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(10);
  await notch.click();
  await expect(page).toHaveURL(/\/(app|welcome)$/); // first visit goes through the welcome tour
});

test("the scene book turns its pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Stories" }).click();
  // Scene book: dithered prints load, pages turn both ways, and the last page invites your story.
  await page.locator("#stories").scrollIntoViewIfNeeded();
  await expect(page.locator(".sb-art img").first()).toBeVisible({ timeout: 15_000 });
  const next = page.getByRole("button", { name: "Next scene" });
  await next.click();
  await expect(page.locator(".sb-caption")).toHaveText(/Scene 02/);
  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect(page.locator(".sb-caption")).toHaveText(/Scene 01/);
  for (let k = 0; k < 5; k++) {
    await next.click();
    await expect(page.locator(".sb-caption")).toHaveText(new RegExp(`Scene 0${k + 2}`));
  }
  await expect(next).toBeDisabled();
  await expect(page.locator("#stories")).toContainText("Your story, next");

  // Print settings open.
  await page.getByRole("button", { name: "Print settings" }).click();
  await expect(page.getByRole("dialog", { name: "Print settings" })).toContainText("Dither");

});

test("a mouse wheel flick turns exactly one full-screen page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const pages = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".lg-page")].map((e) => e.offsetTop));
  await page.mouse.move(600, 300);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBe(pages[1]);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBe(pages[2]);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBe(pages[1]);
});

test("the boot screen shows the wave loader before any script runs", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Loading JOTR" })).toBeVisible();
  await expect(page.locator(".wl-row i")).toHaveCount(15);
  await ctx.close();
});
