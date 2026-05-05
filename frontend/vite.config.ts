import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // Proxy /api requests to the backend so the cookie origin matches
    // (avoids CORS issues with HttpOnly cookies in development).
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },

  // Vitest configuration — colocated here so a single `vite.config.ts` drives
  // both the dev server and the test runner.
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
} as Parameters<typeof defineConfig>[0]);
