import { Router } from 'express';

import { isTest } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { healthRouter } from './health.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);

/**
 * GET /api/__boom — mounted only under NODE_ENV=test.
 *
 * Exists so an integration test can prove the error middleware's output shape
 * without waiting for a real feature to fail. 418 is used precisely because no
 * real endpoint will ever return it, so a test asserting on it cannot pass by
 * accident.
 */
if (isTest) {
  apiRouter.get('/__boom', () => {
    throw new AppError('Intentional test failure', 418);
  });

  /**
   * The other half: something we did not raise on purpose. A real one would be
   * a Prisma error carrying a query, a connection string or a column name, and
   * the handler must flatten it to a generic 500 rather than pass it on.
   */
  apiRouter.get('/__boom-raw', () => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432 — user=admin password=hunter2');
  });
}
