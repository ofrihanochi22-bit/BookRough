import { defineConfig } from 'vitest/config';

import { coverageExclusions } from './vitest.shared.js';

// Unit tests: everything colocated with the code, except the Supertest
// integration specs, which have their own config and their own CI job.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**', 'dist/**'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: coverageExclusions,
      // No threshold here on purpose. This config sees only the unit suite, so
      // files covered by the Supertest suite would report 0% and fail a floor
      // they actually pass. The gate lives in vitest.coverage.config.ts, which
      // measures both suites together.
    },
  },
});
