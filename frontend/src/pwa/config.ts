import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * The service worker's configuration — docs/features/pwa-offline.md §3.1, §3.2.
 * Kept out of vite.config.ts so a unit test can check the rules without a build.
 */

interface RouteContext {
  url: URL;
  request: Request;
  sameOrigin: boolean;
}

/*
 * The two matchers below are copied into sw.js as source text by Workbox, so
 * each must be self-contained: no imports, no module-level constants. The
 * unit test rebuilds them from their source to keep it that way.
 */

/**
 * API reads: same-origin GETs under /api — except the session and sign-in
 * (never cached, deployment.md §6.2) and the health probe.
 */
export function isCachedApiRead({ url, request, sameOrigin }: RouteContext): boolean {
  return (
    sameOrigin &&
    request.method === 'GET' &&
    url.pathname.startsWith('/api/') &&
    !/^\/api\/auth(\/|$)/.test(url.pathname) &&
    url.pathname !== '/api/health'
  );
}

/** Album art and Google photos: images from other origins (our own are precached). */
export function isRemoteImage({ request, sameOrigin }: RouteContext): boolean {
  return !sameOrigin && request.destination === 'image';
}

export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: 'generateSW',
  // The new version waits for the user's Reload (components/UpdatePrompt.tsx).
  registerType: 'prompt',
  // Registered from UpdatePrompt through virtual:pwa-register/react.
  injectRegister: false,
  // Step 6.1's public/manifest.webmanifest stays the source.
  manifest: false,
  // Never on the dev server (CLAUDE.md §16).
  devOptions: { enabled: false },
  workbox: {
    globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: isCachedApiRead,
        // No networkTimeoutSeconds: online answers stay fresh, even through a cold start.
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: isRemoteImage,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 150,
            maxAgeSeconds: 60 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          },
          // 0: cross-origin images without CORS arrive opaque.
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
};
