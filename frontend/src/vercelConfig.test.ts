// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The production routing contract (docs/features/production-deploy.md §3.2).
 * Nothing else exercises vercel.json before production: E2E serves the build
 * itself, so a reordered or widened rule would first show up on the live site.
 */
interface Rewrite {
  source: string;
  destination: string | { service: string };
}

interface VercelConfig {
  services: Record<string, Record<string, unknown> & { rewrites?: Rewrite[] }>;
  rewrites: Rewrite[];
  [key: string]: unknown;
}

const config = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf-8'),
) as VercelConfig;

/** A Vercel source such as "/api/:path*" or "/([^.]*)", as an anchored RegExp. */
function matcher(source: string): RegExp {
  const pattern = source.replace('/:path*', '(?:/.*)?');
  return new RegExp(`^${pattern}$`);
}

function serviceFor(path: string): string | undefined {
  const rule = config.rewrites.find((r) => matcher(r.source).test(path));
  return typeof rule?.destination === 'object' ? rule.destination.service : undefined;
}

describe('vercel.json', () => {
  it('builds the API from the backend Dockerfile and the site from the frontend', () => {
    // Assert
    expect(config.services.api).toMatchObject({ root: 'backend/', entrypoint: 'Dockerfile' });
    expect(config.services.web).toMatchObject({ root: 'frontend/', outputDirectory: 'dist' });
  });

  it('routes /api and everything under it to the API, before the catch-all', () => {
    // Act & Assert
    expect(serviceFor('/api')).toBe('api');
    expect(serviceFor('/api/health')).toBe('api');
    expect(serviceFor('/api/communities/c1/posts')).toBe('api');
    expect(config.rewrites.at(-1)?.source).toBe('/(.*)');
  });

  it('sends every other path to the site', () => {
    // Act & Assert
    expect(serviceFor('/')).toBe('web');
    expect(serviceFor('/communities/c1')).toBe('web');
    expect(serviceFor('/apiary')).toBe('web');
  });

  it('falls back to index.html only for paths without a file extension', () => {
    // Arrange
    const fallback = config.services.web?.rewrites?.find((r) => r.destination === '/index.html');

    // Act & Assert
    expect(fallback).toBeDefined();
    const deepLink = matcher(fallback!.source);
    expect(deepLink.test('/communities/c1')).toBe(true);
    expect(deepLink.test('/invite/qEP_iUKg0kWils3eSHVHZQ')).toBe(true);
    expect(deepLink.test('/assets/index-OLDHASH.js')).toBe(false);
    expect(deepLink.test('/favicon.ico')).toBe(false);
  });

  it('keeps build settings out of the top level, where services mode rejects them', () => {
    // Assert
    for (const key of [
      'buildCommand',
      'framework',
      'outputDirectory',
      'installCommand',
      'functions',
    ]) {
      expect(config).not.toHaveProperty(key);
    }
  });
});
