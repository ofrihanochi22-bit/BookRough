import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:5173";
const BACKEND_URL = process.env["BACKEND_URL"] ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: `npm --prefix ../backend run dev`,
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        DATABASE_URL:
          process.env["TEST_DATABASE_URL"] ??
          "postgres://bookrough:bookrough@localhost:5432/music_app_test_db",
        NODE_ENV: "test",
      },
    },
    {
      command: `npm --prefix ../frontend run dev`,
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
