/**
 * Shared between the three Vitest configs so an exclusion is written once.
 * Adding a file here removes it from every coverage report at the same time —
 * which is the point: the unit and merged reports must never disagree about
 * what is being measured.
 */
export const coverageExclusions = [
  // Process bootstrap: binds a port and registers signal handlers. Exercised by
  // running the server, not by a test.
  'src/index.ts',
  // Generated Prisma client output.
  'src/generated/**',
  // Type-only declarations produce no runtime code.
  'src/**/*.d.ts',
  // Tests and their helpers are not the subject of coverage.
  'src/**/*.test.ts',
  'src/test/**',
];
