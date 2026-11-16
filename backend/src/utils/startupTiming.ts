import type { Logger } from 'pino';

/**
 * Cold-start measurement (docs/features/client-cache.md §4.1). The Dockerfile's
 * start command records a millisecond timestamp before and after
 * `prisma migrate deploy`; Node turns them into durations. Locally neither is
 * set, and only what Node can measure itself is logged.
 */
export interface StartupEnv {
  BOOT_STARTED_AT?: string;
  MIGRATE_FINISHED_AT?: string;
}

export interface StartupTimings {
  /** How long `prisma migrate deploy` took, when the start command measured it. */
  migrateMs?: number;
  /** From the end of migrations (or from process start) to listening. */
  bootMs: number;
}

function timestamp(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

export function startupTimings(env: StartupEnv, now: number, uptimeMs: number): StartupTimings {
  const started = timestamp(env.BOOT_STARTED_AT);
  const migrated = timestamp(env.MIGRATE_FINISHED_AT);
  if (started === undefined || migrated === undefined || migrated < started || now < migrated) {
    return { bootMs: Math.round(uptimeMs) };
  }
  return { migrateMs: migrated - started, bootMs: now - migrated };
}

/**
 * Opens the database connection right after listening and logs how long it
 * took. A failure is a warning, not a crash: the server keeps serving, as it
 * does today when the database is down, and the first query retries.
 */
export async function connectAndLog(
  connect: () => Promise<void>,
  log: Pick<Logger, 'info' | 'warn'>,
  now: () => number = Date.now,
): Promise<void> {
  const started = now();
  try {
    await connect();
    log.info({ connectMs: now() - started }, 'Database connected');
  } catch (err) {
    log.warn({ err, connectMs: now() - started }, 'Database connect failed');
  }
}
