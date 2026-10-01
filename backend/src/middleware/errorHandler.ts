import type { ErrorRequestHandler } from 'express';

import { isAppError } from '../utils/AppError.js';
import { failure } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('errorHandler');

const GENERIC_MESSAGE = 'Something went wrong.';

/**
 * The single place an error response is written (CLAUDE.md §4).
 * Registered last, after every route and after `notFound`.
 *
 * An AppError is something we raised on purpose, so its message is safe to
 * show. Anything else is a bug: it is logged with its stack and reported as a
 * flat 500, because a raw database or library error must never reach a client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (isAppError(err)) {
    log.warn(
      { statusCode: err.statusCode, path: req.originalUrl, method: req.method },
      err.message,
    );
    res.status(err.statusCode).json(failure(err.statusCode, err.message));
    return;
  }

  // express.json() rejects a body before any controller sees it. These are the
  // client's mistakes, not bugs, and must not surface as a 500.
  const bodyError = bodyParserError(err);
  if (bodyError) {
    log.warn(
      { statusCode: bodyError.code, path: req.originalUrl, method: req.method },
      bodyError.message,
    );
    res.status(bodyError.code).json(failure(bodyError.code, bodyError.message));
    return;
  }

  log.error(
    {
      err,
      path: req.originalUrl,
      method: req.method,
    },
    'Unhandled error',
  );

  res.status(500).json(failure(500, GENERIC_MESSAGE));
};

/**
 * express.json() throws http-errors: `status` is the right 4xx and `expose`
 * marks the error as caused by the client (bad JSON, too large, unsupported
 * charset or encoding). Any of those is passed on with its own status; the
 * message is ours, not the library's.
 */
function bodyParserError(err: unknown): { code: number; message: string } | null {
  const { status, expose, type } = (err ?? {}) as {
    status?: unknown;
    expose?: unknown;
    type?: unknown;
  };
  if (expose !== true || typeof status !== 'number' || status < 400 || status >= 500) {
    return null;
  }
  if (type === 'entity.parse.failed') {
    return { code: 400, message: 'The request body is not valid JSON.' };
  }
  if (type === 'entity.too.large') {
    return { code: 413, message: 'The request body is too large.' };
  }
  return { code: status, message: 'The request body could not be read.' };
}
