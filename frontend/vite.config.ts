/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

import { pwaOptions } from './src/pwa/config';

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  server: {
    port: 5173,
  },
  // E2E serves the build with `vite preview` and proxies /api to the backend,
  // so the API is same-origin as in production (vercel.json) — the service
  // worker only caches same-origin /api reads (docs/features/pwa-offline.md §3.2).
  preview: process.env.PREVIEW_API_PROXY
    ? { proxy: { '/api': process.env.PREVIEW_API_PROXY } }
    : undefined,
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
