/**
 * Fixed settings of the burst load test — docs/features/load-test.md.
 *
 * Nothing here is read from the app's own config: importing `src/config/env.ts`
 * would validate the developer's `.env` at import time, and this tool must not
 * depend on it. Values that mirror the app are marked with where they come from.
 */

/** The burst sizes, in order. Each is sent over WINDOW_MS (load-test.md §4.2). */
export const DEFAULT_ROUNDS = [10, 20, 30, 40, 50] as const;
export const MAX_ROUND_SIZE = 50;
export const WINDOW_MS = 5_000;

/** Long enough to see how late a late answer is, rather than cutting it off. */
export const CLIENT_TIMEOUT_MS = 30_000;
/** Mirrors CONVERSION_CEILING_MS in src/services/requestDeadline.ts (CLAUDE.md §7). */
export const CEILING_MS = 12_000;
/** The request, the database insert and the response on top of the conversion. */
export const CEILING_MARGIN_MS = 1_000;

export const HEALTH_INTERVAL_MS = 1_000;
export const HEALTH_TIMEOUT_MS = 5_000;
/** A health check slower than this while a burst runs means the server is struggling. */
export const HEALTH_SLOW_MS = 2_000;

/** Between rounds: at least this long, and until no Chromium is left running. */
export const COOLDOWN_MIN_MS = 20_000;
export const COOLDOWN_MAX_MS = 90_000;
export const STARTUP_TIMEOUT_MS = 90_000;

// --- Docker ------------------------------------------------------------------

export const IMAGE = 'bookrough-backend:loadtest';
export const API_CONTAINER = 'bookrough-loadtest-api';
/** A Vercel Hobby instance: 2 GB and 1 vCPU (docs/deployment.md §3.6). */
export const MEMORY_LIMIT = '2g';
export const MEMORY_LIMIT_MB = 2048;
export const CPU_LIMIT = '1';
/** Not 4000, so a dev server already running there is left alone. */
export const API_PORT = 4100;
export const API_BASE = `http://localhost:${API_PORT}`;

/** The compose Postgres (docker-compose.yml). */
export const PG_CONTAINER = 'bookrough-postgres';
export const PG_USER = 'bookrough';
export const PG_PASSWORD = 'bookrough';
export const PG_HOST_PORT = 5433;
export const DB_NAME = 'music_app_loadtest_db';

/** From this machine (the seed) and from inside the API container. */
export const HOST_DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_HOST_PORT}/${DB_NAME}`;
export const CONTAINER_DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@host.docker.internal:${PG_HOST_PORT}/${DB_NAME}`;

/** Marks every seeded user, so a stray row is recognisable (load-test.md §3). */
export const GOOGLE_SUB_PREFIX = 'loadtest-';

/**
 * Refuses any database but the load-test one. Seeding and dropping are
 * destructive, and the dev database must never be touched (load-test.md §4.5).
 */
export function assertLoadTestDatabase(url: string): void {
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`Not a database URL: refusing to use it.`);
  }
  if (name !== DB_NAME) {
    throw new Error(`The load test runs only against ${DB_NAME}, not "${name}".`);
  }
}

/** `--rounds 10,20` for a short run; every size must be 1–MAX_ROUND_SIZE. */
export function parseRounds(argv: readonly string[]): number[] {
  const at = argv.indexOf('--rounds');
  if (at === -1) {
    return [...DEFAULT_ROUNDS];
  }
  const value = argv[at + 1];
  const sizes = (value ?? '').split(',').map((part) => Number(part.trim()));
  if (
    sizes.length === 0 ||
    sizes.some((size) => !Number.isInteger(size) || size < 1 || size > MAX_ROUND_SIZE)
  ) {
    throw new Error(`--rounds takes sizes from 1 to ${MAX_ROUND_SIZE}, such as 10,20,30.`);
  }
  return sizes;
}
