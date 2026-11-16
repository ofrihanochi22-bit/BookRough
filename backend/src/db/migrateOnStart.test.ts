import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import {
  type AppliedMigration,
  type MigrateOnStartDeps,
  isUpToDate,
  listLocalMigrations,
  migrateOnStart,
  runPrismaDeploy,
} from './migrateOnStart.js';

// docs/features/migrate-check-on-start.md §7.

const DONE = new Date('2026-11-16T10:00:00Z');

function row(name: string, overrides: Partial<AppliedMigration> = {}): AppliedMigration {
  return { migration_name: name, finished_at: DONE, rolled_back_at: null, ...overrides };
}

function deps(overrides: Partial<MigrateOnStartDeps> = {}) {
  const log = { info: vi.fn(), error: vi.fn() };
  let tick = 0;
  const base: MigrateOnStartDeps = {
    listLocal: () => Promise.resolve(['001_init', '002_posts']),
    readApplied: () => Promise.resolve([row('001_init'), row('002_posts')]),
    runDeploy: vi.fn(() => Promise.resolve(0)),
    log,
    // Each call advances 100 ms, so every duration is predictable.
    now: () => (tick += 100),
    ...overrides,
  };
  return { ...base, log };
}

describe('isUpToDate', () => {
  it('is true when every shipped migration finished', () => {
    // Act & Assert
    expect(isUpToDate(['a', 'b'], [row('a'), row('b')])).toBe(true);
  });

  it('is true when the database has rows this build does not ship', () => {
    // Act & Assert
    expect(isUpToDate(['a'], [row('a'), row('z_newer')])).toBe(true);
  });

  it('is false when a shipped migration has no row', () => {
    // Act & Assert
    expect(isUpToDate(['a', 'b'], [row('a')])).toBe(false);
  });

  it('is false when a migration failed (unfinished, not rolled back)', () => {
    // Act & Assert
    expect(isUpToDate(['a'], [row('a'), row('z_other', { finished_at: null })])).toBe(false);
  });

  it('is false when the matching row was rolled back', () => {
    // Act & Assert
    expect(isUpToDate(['a'], [row('a', { rolled_back_at: DONE })])).toBe(false);
  });

  it('is true when a rolled-back attempt was later applied again', () => {
    // Arrange
    const applied = [row('a', { finished_at: null, rolled_back_at: DONE }), row('a')];

    // Act & Assert
    expect(isUpToDate(['a'], applied)).toBe(true);
  });
});

describe('migrateOnStart', () => {
  it('skips the CLI when the database is up to date', async () => {
    // Arrange
    const d = deps();

    // Act
    const ready = await migrateOnStart(d);

    // Assert
    expect(ready).toBe(true);
    expect(d.runDeploy).not.toHaveBeenCalled();
    expect(d.log.info).toHaveBeenCalledWith({ checkMs: 100, count: 2 }, 'Migrations up to date');
  });

  it('runs the CLI when a migration is pending, and logs both durations', async () => {
    // Arrange
    const d = deps({ readApplied: () => Promise.resolve([row('001_init')]) });

    // Act
    const ready = await migrateOnStart(d);

    // Assert
    expect(ready).toBe(true);
    expect(d.runDeploy).toHaveBeenCalledOnce();
    expect(d.log.info).toHaveBeenCalledWith({ checkMs: 100, migrateMs: 100 }, 'Migrations applied');
  });

  it('runs the CLI when the table does not exist (an empty database)', async () => {
    // Arrange
    const d = deps({ readApplied: () => Promise.reject(new Error('relation does not exist')) });

    // Act
    const ready = await migrateOnStart(d);

    // Assert
    expect(ready).toBe(true);
    expect(d.runDeploy).toHaveBeenCalledOnce();
  });

  it('runs the CLI when the migrations folder cannot be read', async () => {
    // Arrange
    const d = deps({ listLocal: () => Promise.reject(new Error('ENOENT')) });

    // Act
    await migrateOnStart(d);

    // Assert
    expect(d.runDeploy).toHaveBeenCalledOnce();
  });

  it('runs the CLI when a migration is left failed', async () => {
    // Arrange
    const d = deps({
      readApplied: () =>
        Promise.resolve([row('001_init'), row('002_posts'), row('003_x', { finished_at: null })]),
    });

    // Act
    await migrateOnStart(d);

    // Assert
    expect(d.runDeploy).toHaveBeenCalledOnce();
  });

  it('reports failure, with the exit code, when the CLI exits non-zero', async () => {
    // Arrange
    const d = deps({
      readApplied: () => Promise.resolve([]),
      runDeploy: () => Promise.resolve(1),
    });

    // Act
    const ready = await migrateOnStart(d);

    // Assert
    expect(ready).toBe(false);
    expect(d.log.error).toHaveBeenCalledWith(
      { checkMs: 100, migrateMs: 100, exitCode: 1 },
      'Migrations failed',
    );
    expect(d.log.info).not.toHaveBeenCalled();
  });

  it('reports failure when the CLI cannot be started', async () => {
    // Arrange
    const err = new Error('spawn ENOENT');
    const d = deps({
      readApplied: () => Promise.resolve([]),
      runDeploy: () => Promise.reject(err),
    });

    // Act
    const ready = await migrateOnStart(d);

    // Assert
    expect(ready).toBe(false);
    expect(d.log.error).toHaveBeenCalledWith(
      { err, checkMs: 100, migrateMs: 100 },
      'Migrations failed',
    );
  });

  it('uses the real clock when none is given', async () => {
    // Arrange
    const { now: _now, ...withoutClock } = deps();

    // Act
    const ready = await migrateOnStart(withoutClock);

    // Assert
    expect(ready).toBe(true);
    expect(withoutClock.log.info).toHaveBeenCalledWith(
      { checkMs: expect.any(Number), count: 2 },
      'Migrations up to date',
    );
  });
});

describe('listLocalMigrations', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('lists folders that hold a migration.sql, ignoring other entries', async () => {
    // Arrange
    dir = await mkdtemp(join(tmpdir(), 'migrations-'));
    await mkdir(join(dir, '001_init'));
    await writeFile(join(dir, '001_init', 'migration.sql'), 'SELECT 1;');
    await mkdir(join(dir, '002_empty'));
    await writeFile(join(dir, 'migration_lock.toml'), 'provider = "postgresql"');

    // Act
    const names = await listLocalMigrations(dir);

    // Assert
    expect(names).toEqual(['001_init']);
  });

  it('throws when the folder does not exist', async () => {
    // Act & Assert
    await expect(listLocalMigrations(join(tmpdir(), 'no-such-migrations-dir'))).rejects.toThrow();
  });

  it('finds the migrations this build ships by default', async () => {
    // Act
    const names = await listLocalMigrations();

    // Assert
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain('migration_lock.toml');
  });
});

describe('runPrismaDeploy', () => {
  class FakeChild extends EventEmitter {
    kill = vi.fn();
  }

  afterEach(() => {
    spawnMock.mockReset();
  });

  function start() {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const result = runPrismaDeploy();
    return { child, result };
  }

  it("runs the CLI's own entry file with this Node, without a shell", async () => {
    // Arrange
    const { child, result } = start();

    // Act
    child.emit('exit', 0, null);

    // Assert
    await expect(result).resolves.toBe(0);
    const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], object];
    expect(command).toBe(process.execPath);
    expect(args[0]).toMatch(/prisma[\\/]build[\\/]index\.js$/);
    expect(args.slice(1, 3)).toEqual(['migrate', 'deploy']);
    expect(args[3]).toBe('--schema');
    expect(args[4]).toMatch(/prisma[\\/]schema\.prisma$/);
    expect(options).toEqual({ stdio: 'inherit' });
  });

  it('resolves with a non-zero exit code', async () => {
    // Arrange
    const { child, result } = start();

    // Act
    child.emit('exit', 1, null);

    // Assert
    await expect(result).resolves.toBe(1);
  });

  it('treats an exit by signal as a failure', async () => {
    // Arrange
    const { child, result } = start();

    // Act
    child.emit('exit', null, 'SIGTERM');

    // Assert
    await expect(result).resolves.toBe(1);
  });

  it('rejects when the CLI cannot be started', async () => {
    // Arrange
    const { child, result } = start();
    const err = new Error('spawn ENOENT');

    // Act
    child.emit('error', err);

    // Assert
    await expect(result).rejects.toBe(err);
  });

  it('passes a stop signal on to the CLI while it runs, and stops listening after', async () => {
    // Arrange
    const before = process.listenerCount('SIGTERM');
    const { child, result } = start();

    // Act
    process.emit('SIGTERM', 'SIGTERM');
    child.emit('exit', null, 'SIGTERM');
    await result;

    // Assert
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
