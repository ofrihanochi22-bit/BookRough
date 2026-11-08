import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModuleNs from '../config/env.js';

type EnvModule = typeof EnvModuleNs;

/*
 * The test-only hooks must be unusable on a real server
 * (docs/features/production-hardening.md §3.1). The module reads the
 * environment at import, so each case imports a fresh copy.
 */
describe('rate-limit test hooks', () => {
  afterEach(() => {
    vi.doUnmock('../config/env.js');
    vi.resetModules();
  });

  it.each(['setRateLimitsEnabled', 'resetRateLimits'] as const)(
    '%s throws outside NODE_ENV=test',
    async (hook) => {
      // Arrange
      vi.resetModules();
      vi.doMock('../config/env.js', async (importOriginal) => {
        const actual = await importOriginal<EnvModule>();
        return { ...actual, isTest: false, env: { ...actual.env, NODE_ENV: 'production' } };
      });
      const module = await import('./rateLimits.js');

      // Act & Assert
      expect(() =>
        hook === 'setRateLimitsEnabled' ? module[hook](true) : module[hook](),
      ).toThrowError(/only available under NODE_ENV=test/);
    },
  );

  it('both work under NODE_ENV=test', async () => {
    // Arrange
    vi.resetModules();
    const module = await import('./rateLimits.js');

    // Act & Assert
    expect(() => {
      module.setRateLimitsEnabled(true);
      module.resetRateLimits();
      module.setRateLimitsEnabled(false);
    }).not.toThrow();
  });
});
