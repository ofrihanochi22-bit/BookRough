import { describe, expect, it } from 'vitest';

import { isCachedApiRead, isRemoteImage, pwaOptions } from './config';

/*
 * The service worker's rules, checked without a build
 * (docs/features/pwa-offline.md §7). Workbox copies the two matchers into sw.js
 * as source text, so they run rebuilt from that text here: one that leaned on
 * an import or a module constant would throw, as it would in the worker.
 */
const inWorker = <T>(matcher: T): T => new Function(`return (${String(matcher)})`)() as T;

const apiRead = inWorker(isCachedApiRead);
const remoteImage = inWorker(isRemoteImage);

function context(path: string, method = 'GET', sameOrigin = true) {
  return {
    url: new URL(path, 'https://bookrough.vercel.app'),
    request: { method } as Request,
    sameOrigin,
  };
}

function imageContext(destination: string, sameOrigin: boolean) {
  return {
    url: new URL('https://i.scdn.co/image/cover'),
    request: { destination } as Request,
    sameOrigin,
  };
}

const { workbox } = pwaOptions;
const [apiRule, imageRule] = workbox?.runtimeCaching ?? [];

describe('the API rule', () => {
  it.each([
    '/api/communities',
    '/api/communities/c1/posts',
    '/api/recommendations/received',
    '/api/users/me/bookmarks',
  ])('caches GET %s on our own origin', (path) => {
    // Act & Assert
    expect(apiRead(context(path))).toBe(true);
  });

  it.each(['/api/auth/me', '/api/auth/google', '/api/auth', '/api/health'])(
    'never caches GET %s',
    (path) => {
      // Act & Assert
      expect(apiRead(context(path))).toBe(false);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('never caches a %s', (method) => {
    // Act & Assert
    expect(apiRead(context('/api/communities', method))).toBe(false);
  });

  it("ignores another origin's /api, and paths outside /api", () => {
    // Act & Assert
    expect(apiRead(context('/api/communities', 'GET', false))).toBe(false);
    expect(apiRead(context('/apiary'))).toBe(false);
    expect(apiRead(context('/communities/c1'))).toBe(false);
  });

  it('is network first with no timeout, and keeps only status 200', () => {
    // Assert
    expect(apiRule).toMatchObject({
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api',
        expiration: { maxEntries: 200, maxAgeSeconds: 2_592_000 },
        cacheableResponse: { statuses: [200] },
      },
    });
    expect(apiRule?.options).not.toHaveProperty('networkTimeoutSeconds');
  });
});

describe('the image rule', () => {
  it.each([
    'https://i.scdn.co/image/cover',
    'https://is1-ssl.mzstatic.com/image/cover.jpg',
    'https://f4.bcbits.com/img/a1_10.jpg',
    'https://i1.sndcdn.com/artworks-1-t500x500.jpg',
    'https://i.ytimg.com/vi/abc/hqdefault.jpg',
  ])('caches an image from another origin, with no host list: %s', (url) => {
    // Act & Assert
    expect(
      remoteImage({
        url: new URL(url),
        request: { destination: 'image' } as Request,
        sameOrigin: false,
      }),
    ).toBe(true);
  });

  it('leaves same-origin images to the precache, and other requests alone', () => {
    // Act & Assert
    expect(remoteImage(imageContext('image', true))).toBe(false);
    expect(remoteImage(imageContext('', false))).toBe(false);
    expect(remoteImage(imageContext('script', false))).toBe(false);
  });

  it('is cache first, keeps opaque answers, and gives way under quota pressure', () => {
    // Assert
    expect(imageRule).toMatchObject({
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: { maxEntries: 150, maxAgeSeconds: 5_184_000, purgeOnQuotaError: true },
        cacheableResponse: { statuses: [0, 200] },
      },
    });
  });
});

describe('the worker', () => {
  it('opens every route from the shell, and never answers /api with it', () => {
    // Assert
    expect(workbox?.navigateFallback).toBe('/index.html');
    expect(workbox?.navigateFallbackDenylist?.some((rule) => rule.test('/api/health'))).toBe(true);
    expect(workbox?.navigateFallbackDenylist?.some((rule) => rule.test('/friends'))).toBe(false);
  });

  it('waits for Reload, reuses the manifest, and stays off the dev server', () => {
    // Assert
    expect(pwaOptions).toMatchObject({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      devOptions: { enabled: false },
    });
    expect(workbox).not.toHaveProperty('skipWaiting');
    expect(workbox).not.toHaveProperty('clientsClaim');
    expect(workbox?.cleanupOutdatedCaches).toBe(true);
  });
});
