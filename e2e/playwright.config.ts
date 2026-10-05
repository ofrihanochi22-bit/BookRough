import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

/**
 * Golden loops only (CLAUDE.md §10). Anything an integration test already
 * proves does not get a second, slower proof here.
 *
 * Google is replaced by a stand-in (docs/features/auth-flow-e2e.md): the
 * browser gets a stubbed sign-in script (support/googleStandIn.ts) and the API
 * verifies its tokens with E2E_GOOGLE_PUBLIC_KEY. squigly.link is replaced the
 * same way: the API reads canned conversions from fixtures/scraper-stand-in.json
 * (docs/features/posts-feed.md §4.2), except for the one link the nightly
 * live-site test sends to the real converter. Everything else is real.
 *
 * In CI the workflow starts both servers, because the API needs the database
 * service container only the workflow can provide. Locally, `webServer` below
 * builds and starts them against music_app_test_db on their own ports, so the
 * dev servers and the dev database are never touched.
 */

const isCI = !!process.env.CI;

const LOCAL_API_PORT = 4100;
const LOCAL_WEB_PORT = 4173;
const LOCAL_CLIENT_ID = 'e2e-client-id.apps.googleusercontent.com';

// Read by support/googleStandIn.ts to sign tokens for the right audience.
process.env.VITE_GOOGLE_CLIENT_ID ??= LOCAL_CLIENT_ID;

const scraperFixtures = fileURLToPath(new URL('./fixtures/scraper-stand-in.json', import.meta.url));

const standInPublicKey = readFileSync(
  fileURLToPath(new URL('./fixtures/google-stand-in.pub', import.meta.url)),
  'utf8',
);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${LOCAL_WEB_PORT}`,
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
  webServer: isCI
    ? undefined
    : [
        {
          name: 'api',
          cwd: '../backend',
          command: 'npx prisma migrate deploy && npm run build && node dist/index.js',
          url: `http://localhost:${LOCAL_API_PORT}/api/health`,
          timeout: 120_000,
          reuseExistingServer: false,
          env: {
            NODE_ENV: 'test',
            PORT: String(LOCAL_API_PORT),
            DATABASE_URL: 'postgresql://bookrough:bookrough@localhost:5433/music_app_test_db',
            JWT_SECRET: 'local-e2e-only-secret-value-long-enough-for-validation',
            GOOGLE_CLIENT_ID: LOCAL_CLIENT_ID,
            CORS_ORIGIN: `http://localhost:${LOCAL_WEB_PORT}`,
            E2E_GOOGLE_PUBLIC_KEY: standInPublicKey,
            E2E_SCRAPER_FIXTURES: scraperFixtures,
          },
        },
        {
          name: 'web',
          cwd: '../frontend',
          command: `npm run build && npx vite preview --port ${LOCAL_WEB_PORT} --strictPort`,
          url: `http://localhost:${LOCAL_WEB_PORT}`,
          timeout: 120_000,
          reuseExistingServer: false,
          env: {
            VITE_API_BASE_URL: `http://localhost:${LOCAL_API_PORT}/api`,
            VITE_GOOGLE_CLIENT_ID: LOCAL_CLIENT_ID,
          },
        },
      ],
});
