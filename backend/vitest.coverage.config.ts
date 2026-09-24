import { defineConfig } from 'vitest/config';

import { coverageExclusions } from './vitest.shared.js';

/**
 * The coverage gate (CLAUDE.md §10) — and the only place the 80% floor lives.
 *
 * Why a third config exists: the unit and integration suites run separately, by
 * design, because they have very different costs and the PR pipeline keeps them
 * in separate jobs. But coverage measured over only one of them is a lie about
 * the other: `app.ts`, both middleware and the route files are fully exercised
 * by the Supertest suite and report 0% under the unit config alone. Enforcing a
 * floor on that number would fail the build on correct code, and the tempting
 * way out — excluding those files — is exactly the gaming §10 forbids.
 *
 * So this config runs both suites in one pass and measures them together. It
 * needs the test database, and therefore runs in the CI job that has Postgres.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: coverageExclusions,
      thresholds: {
        lines: 80,
      },
    },
  },
});
