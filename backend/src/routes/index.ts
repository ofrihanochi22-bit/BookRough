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
}
