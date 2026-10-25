import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  webServer: { command: "node e2e/serve.mjs", url: "http://localhost:4300/call.html", reuseExistingServer: !process.env.CI },
});
