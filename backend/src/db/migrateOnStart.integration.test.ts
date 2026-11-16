import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  isUpToDate,
  listLocalMigrations,
  migrateOnStart,
  readAppliedMigrations,
  runPrismaDeploy,
} from './migrateOnStart.js';
import { prisma } from './prisma.js';

// docs/features/migrate-check-on-start.md §7: the real check against
// music_app_test_db, which the suite's global setup has fully migrated.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migrateOnStart against the test database', () => {
  it('reads Prisma bookkeeping table and finds every shipped migration applied', async () => {
    // Act
    const [local, applied] = await Promise.all([listLocalMigrations(), readAppliedMigrations()]);

    // Assert
    expect(applied.length).toBeGreaterThanOrEqual(local.length);
    expect(isUpToDate(local, applied)).toBe(true);
  });

  it('starts serving without running the CLI', async () => {
    // Arrange
    const runDeploy = vi.fn(() => Promise.resolve(0));
    const log = { info: vi.fn(), error: vi.fn() };

    // Act
    const ready = await migrateOnStart({
      listLocal: () => listLocalMigrations(),
      readApplied: readAppliedMigrations,
      runDeploy,
      log,
    });

    // Assert
    expect(ready).toBe(true);
    expect(runDeploy).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ count: expect.any(Number) }),
      'Migrations up to date',
    );
  });

  it('runs the real CLI, which exits 0 when nothing is pending', async () => {
    // Act
    const exitCode = await runPrismaDeploy();

    // Assert
    expect(exitCode).toBe(0);
  }, 60_000);
});
