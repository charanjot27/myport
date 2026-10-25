import { expect, test } from "@playwright/test";

/** Sign-up and two-device script sync through the real API (in-memory database). */

test("account sign-up and script sync across devices", async ({ browser }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const useApi = () => localStorage.setItem("promptsense.settings.v1", JSON.stringify({ apiUrl: "/api", onboarded: true }));

  // Device 1: create a script, then sign up; the script uploads.
  const one = await browser.newContext();
  await one.addInitScript(useApi);
  const p1 = await one.newPage();
  await p1.goto("/");
  await p1.getByRole("button", { name: "Try the sample script" }).click();
  await expect(p1.getByText("Saved")).toBeVisible();
  await p1.getByRole("link", { name: "Sign in" }).click();
  await p1.getByRole("button", { name: "Create an account instead" }).click();
  await p1.getByLabel("Email").fill(email);
  await p1.getByLabel("Password").fill("a long enough password");
  await p1.getByRole("button", { name: "Create account" }).click();
  await expect(p1.getByText(`Signed in as ${email}`)).toBeVisible();
  await p1.getByRole("link", { name: "Scripts" }).click();
  await expect(p1.getByText(/Synced: 0 downloaded, 1 uploaded/)).toBeVisible();

  // Device 2: fresh browser storage, sign in, the script downloads.
  const two = await browser.newContext();
  await two.addInitScript(useApi);
  const p2 = await two.newPage();
  await p2.goto("/account");
  await p2.getByLabel("Email").fill(email);
  await p2.getByLabel("Password").fill("a long enough password");
  await p2.getByRole("button", { name: "Sign in" }).click();
  await expect(p2.getByText(`Signed in as ${email}`)).toBeVisible();
  await p2.getByRole("link", { name: "Scripts" }).click();
  await expect(p2.getByTestId("script-card")).toContainText("Sample: Welcome to PromptSense");

  await one.close();
  await two.close();
});
