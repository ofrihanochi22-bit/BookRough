import { describe, expect, it, vi } from 'vitest';

import { connectAndLog, startupTimings } from './startupTiming.js';

describe('startupTimings (docs/features/client-cache.md §4.1)', () => {
  it('measures the migration and the boot from the start command timestamps', () => {
    // Arrange
    const env = { BOOT_STARTED_AT: '1000', MIGRATE_FINISHED_AT: '3500' };

    // Act
    const timings = startupTimings(env, 4200, 9999);

    // Assert
    expect(timings).toEqual({ migrateMs: 2500, bootMs: 700 });
  });

  it('falls back to process uptime when the timestamps are absent (local dev)', () => {
    // Arrange
    const env = {};

    // Act
    const timings = startupTimings(env, 4200, 812.6);

    // Assert
    expect(timings).toEqual({ bootMs: 813 });
  });

  it.each([
    ['non-numeric', { BOOT_STARTED_AT: 'abc', MIGRATE_FINISHED_AT: '3500' }],
    ['only one set', { BOOT_STARTED_AT: '1000' }],
    ['out of order', { BOOT_STARTED_AT: '5000', MIGRATE_FINISHED_AT: '3500' }],
    ['in the future', { BOOT_STARTED_AT: '1000', MIGRATE_FINISHED_AT: '9000' }],
  ])('ignores timestamps that are %s', (_label, env) => {
    // Arrange (env above)

    // Act
    const timings = startupTimings(env, 4200, 500);

    // Assert
    expect(timings).toEqual({ bootMs: 500 });
  });
});

describe('connectAndLog', () => {
  it('logs how long the database connection took', async () => {
    // Arrange
    const log = { info: vi.fn(), warn: vi.fn() };
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(1300);

    // Act
    await connectAndLog(() => Promise.resolve(), log, clock);

    // Assert
    expect(log.info).toHaveBeenCalledWith({ connectMs: 1200 }, 'Database connected');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs a warning, and does not throw, when the connection fails', async () => {
    // Arrange
    const log = { info: vi.fn(), warn: vi.fn() };
    const error = new Error("Can't reach database server");
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(400);

    // Act
    await connectAndLog(() => Promise.reject(error), log, clock);

    // Assert
    expect(log.warn).toHaveBeenCalledWith(
      { err: error, connectMs: 300 },
      'Database connect failed',
    );
    expect(log.info).not.toHaveBeenCalled();
  });
});
