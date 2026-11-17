import { createHash, timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const INVALID_INGEST_TOKEN = 'Invalid ingest token.';

/** Fixed-length digests, so the comparison takes the same time whatever was sent. */
function digestOf(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Guards POST /api/ops/snapshots, the CI ingest (docs/features/admin-overview.md
 * §4.3). The bearer token is the only key: a session cookie is not accepted.
 * With no token configured the endpoint is off and answers like an unknown
 * path. Every refusal is the same 401, and the token is never logged (the
 * Authorization header is redacted from every log line).
 */
export function requireIngestToken(
  configured: () => string | undefined = () => env.OPS_INGEST_TOKEN,
): RequestHandler {
  return (req, _res, next) => {
    const expected = configured();
    if (expected === undefined) {
      next(new AppError('Route not found.', 404));
      return;
    }
    const header = req.get('authorization') ?? '';
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match || !timingSafeEqual(digestOf(match[1]!), digestOf(expected))) {
      next(new AppError(INVALID_INGEST_TOKEN, 401));
      return;
    }
    next();
  };
}
