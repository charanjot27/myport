import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The same headers nginx sends in production (deploy/nginx.conf is checked against this file),
// so e2e tests run under the production Content Security Policy.
const securityHeaders = JSON.parse(readFileSync(new URL("./security-headers.json", import.meta.url), "utf8")) as Record<string, string>;

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Same-origin API in development: set VITE_API_URL=/api.
    proxy: { "/api": { target: apiTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  preview: { port: 4173, headers: securityHeaders },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mediapipe: ["@mediapipe/tasks-vision"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
