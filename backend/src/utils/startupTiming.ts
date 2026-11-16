import type { Logger } from 'pino';

/**
 * Cold-start measurement (docs/features/client-cache.md §4.1). The migration
 * check times itself (docs/features/migrate-check-on-start.md); this line is
 * for runs without it, locally and in the E2E job.
 *
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
