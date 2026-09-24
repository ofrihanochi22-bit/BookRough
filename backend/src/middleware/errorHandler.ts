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
