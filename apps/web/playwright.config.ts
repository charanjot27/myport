import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], permissions: ["camera", "microphone"] } }],
  webServer: [
    {
      command: `pnpm exec vite preview --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      env: { API_PROXY_TARGET: "http://localhost:8788" },
    },
    {
      // In-memory API for account and sync tests; reached through the preview server's /api proxy.
      command: "pnpm --filter @promptsense/api start",
      url: "http://localhost:8788/health",
      reuseExistingServer: !process.env.CI,
      env: { PORT: "8788", DATABASE_URL: ":memory:", NODE_ENV: "test", CORS_ORIGINS: `http://localhost:${port}` },
    },
  ],
});
