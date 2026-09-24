import { defineConfig } from 'vitest/config';

// Integration tests: the full request lifecycle through Supertest.
// Run sequentially — from Step 1.1 onward they share one test database and must
// not race each other (docs/tests.md §3.3).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
