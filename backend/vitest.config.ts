import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run in the Node environment (not jsdom) — this is a backend project
    environment: "node",

    // Discover test files colocated with their source (e.g. auth.service.test.ts)
    include: ["src/**/*.test.ts"],

    // Run test setup before every test file (loads .env.test, points Prisma at the test DB)
    setupFiles: ["./src/test/setup.ts"],

    // Run test files sequentially so they don't race on the shared test DB
    fileParallelism: false,
  },
});
