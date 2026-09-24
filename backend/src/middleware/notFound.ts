import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError.js';

/**
 * Registered after every route, before the error handler, so that an unmatched
 * path produces the project's error envelope rather than Express's HTML page.
 */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('Route not found.', 404));
};
