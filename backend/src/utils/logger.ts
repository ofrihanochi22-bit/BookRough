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
export const logger = pino({
  // Tests assert on behaviour, not on log output; a silent logger keeps the
  // runner's output readable.
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    remove: true,
  },
});

/** A child logger tagged with the module that owns it. */
export function createLogger(context: string) {
  return logger.child({ context });
}
