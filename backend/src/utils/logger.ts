import pino from 'pino';

import { env } from '../config/env.js';

/**
 * Structured logging (CLAUDE.md §4). `console.log` is banned in committed code.
 *
 * Output is newline-delimited JSON on stdout in every environment, so a host's
 * log aggregator can parse it without configuration. Each line carries a
 * timestamp, a level, and a `context` naming the module that wrote it.
 *
 * Never log a password, a token, or raw PII — and note that this project stores
 * no email address at all (CLAUDE.md §5).
 */
/**
 * Removed from every log line. The referer is a page URL: on one origin it
 * would carry an invite token (/invite/<token>) or a searched name
 * (/search?q=) — docs/features/find-people.md §4.
 */
export const REDACTED_LOG_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers.referer',
  'res.headers["set-cookie"]',
] as const;

export const logger = pino({
  // Tests assert on behaviour, not on log output; a silent logger keeps the
  // runner's output readable.
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: [...REDACTED_LOG_PATHS], remove: true },
});

/** A child logger tagged with the module that owns it. */
export function createLogger(context: string) {
  return logger.child({ context });
}
