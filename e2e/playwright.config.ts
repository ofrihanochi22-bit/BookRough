import { defineConfig, devices } from '@playwright/test';

/**
 * Golden loops only (CLAUDE.md §10). Anything an integration test already
 * proves does not get a second, slower proof here.
 *
 * There are no specs yet — the first one arrives in Step 1.7, covering sign-in
 * through onboarding to the dashboard. Until then `--pass-with-no-tests` keeps
 * the main.yml job honest: it really runs, and it really has nothing to run.
 *
 * The servers are started by the workflow rather than by Playwright's
 * `webServer`, because the API needs a database service container that only the
 * workflow can provide.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The primary surface is an iPhone running the installed PWA
      // (CLAUDE.md §8), so the golden loops are checked at phone width too.
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
