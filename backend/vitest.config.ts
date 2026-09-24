import { defineConfig } from 'vitest/config';

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
      exclude: [
        // Process bootstrap: binds a port and registers signal handlers.
        // Exercised by running the server, not by a unit test.
        'src/index.ts',
        // Generated Prisma client output.
        'src/generated/**',
        // Type-only declarations produce no runtime code.
        'src/**/*.d.ts',
        // Tests and their helpers are not the subject of coverage.
        'src/**/*.test.ts',
        'src/test/**',
      ],
      // The 80% floor (CLAUDE.md §10) is switched on in Step 0.5, together with
      // the CI job that enforces it.
    },
  },
});
