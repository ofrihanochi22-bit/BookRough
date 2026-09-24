/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Mounts the app into the DOM; there is no behaviour here to assert on.
        'src/main.tsx',
        // Type-only declarations produce no runtime code.
        'src/**/*.d.ts',
        // Tests and their helpers are not the subject of coverage.
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      // The frontend has a single suite, so the floor (CLAUDE.md §10) applies
      // directly here. The backend needs a separate merged-coverage config for
      // the same guarantee — see backend/vitest.coverage.config.ts.
      thresholds: {
        lines: 80,
      },
    },
  },
});
