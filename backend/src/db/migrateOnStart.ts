import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Logger } from 'pino';

import { prisma } from './prisma.js';

/**
 * Migrations on start, only when needed (docs/features/migrate-check-on-start.md).
 *
 * Starting Prisma's CLI on every cold start cost about 2 s even when nothing
 * was pending. The API now compares the migration folders it ships with
 * Prisma's own bookkeeping table and starts the CLI only when they disagree.
 * When in doubt it runs the CLI, so the worst case is the old behaviour.
 */

/** A row of `_prisma_migrations`, the table Prisma's CLI keeps. */
export interface AppliedMigration {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface MigrateOnStartDeps {
  /** Names of the migration folders shipped with this build. */
  listLocal: () => Promise<string[]>;
  /** Rows of `_prisma_migrations`; throws when the table does not exist. */
  readApplied: () => Promise<AppliedMigration[]>;
  /** Runs `prisma migrate deploy`; resolves with its exit code. */
  runDeploy: () => Promise<number>;
  log: Pick<Logger, 'info' | 'error'>;
  now?: () => number;
}

/**
 * True when every shipped migration finished and was not rolled back, and no
 * migration is left failed (unfinished and not rolled back), which Prisma
 * would refuse to continue past. Rows with no shipped folder (an older image
 * after a newer one migrated) do not count against it.
 */
export function isUpToDate(
  local: readonly string[],
  applied: readonly AppliedMigration[],
): boolean {
  const failed = applied.some((row) => row.finished_at === null && row.rolled_back_at === null);
  if (failed) {
    return false;
  }
  const done = new Set(
    applied
      .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
      .map((row) => row.migration_name),
  );
  return local.every((name) => done.has(name));
}

/**
 * Checks, and applies migrations only if something is pending. Resolves true
 * when the database is ready to serve, false when `migrate deploy` failed (the
 * caller exits before serving, as the old start command did).
 */
export async function migrateOnStart(deps: MigrateOnStartDeps): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const started = now();

  // An empty database (no table yet), a query error or an unreadable folder
  // leaves this false: the CLI decides, and reports, as it always did.
  let upToDate = false;
  let count = 0;
  try {
    const [local, applied] = await Promise.all([deps.listLocal(), deps.readApplied()]);
    count = local.length;
    upToDate = isUpToDate(local, applied);
  } catch {
    // Handled above: run the CLI.
  }
  const checkMs = now() - started;

  if (upToDate) {
    deps.log.info({ checkMs, count }, 'Migrations up to date');
    return true;
  }

  const deployStarted = now();
  let exitCode: number;
  try {
    exitCode = await deps.runDeploy();
  } catch (err) {
    deps.log.error({ err, checkMs, migrateMs: now() - deployStarted }, 'Migrations failed');
    return false;
  }
  const migrateMs = now() - deployStarted;

  if (exitCode !== 0) {
    deps.log.error({ checkMs, migrateMs, exitCode }, 'Migrations failed');
    return false;
  }
  deps.log.info({ checkMs, migrateMs }, 'Migrations applied');
  return true;
}

// --- The real dependencies ---------------------------------------------------

/** `backend/prisma`, from `src/db` under Vitest and from `dist/db` in the image. */
const PRISMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../prisma');

/** Folder names under `prisma/migrations` that hold a `migration.sql`. */
export async function listLocalMigrations(dir = join(PRISMA_DIR, 'migrations')): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        stat(join(dir, entry.name, 'migration.sql')).then(
          () => entry.name,
          // A folder without a migration is not one Prisma would apply.
          () => null,
        ),
      ),
  );
  return found.filter((name): name is string => name !== null);
}

/**
 * Raw SQL because `_prisma_migrations` belongs to Prisma's CLI and is not in
 * schema.prisma (CLAUDE.md §4 allows raw SQL where Prisma cannot express it).
 */
export function readAppliedMigrations(): Promise<AppliedMigration[]> {
  return prisma.$queryRaw<AppliedMigration[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
  `;
}

/**
 * The CLI's own entry file, run with this process's Node: no `npx` lookup.
 * Its output goes straight to the container's logs. tini signals only its
 * direct child, Node, so a stop signal is passed on to the CLI while it runs
 * rather than leaving it orphaned; its non-zero exit then stops the start.
 */
export function runPrismaDeploy(): Promise<number> {
  const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  const schema = join(PRISMA_DIR, 'schema.prisma');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
      stdio: 'inherit',
    });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => process.on(signal, forward));
    const done = () => signals.forEach((signal) => process.off(signal, forward));
    child.once('error', (err) => {
      done();
      reject(err);
    });
    child.once('exit', (code, signal) => {
      done();
      resolvePromise(code ?? (signal ? 1 : 0));
    });
  });
}
