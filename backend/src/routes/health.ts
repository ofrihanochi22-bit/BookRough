import { Router } from 'express';

import { success } from '../utils/response.js';

export const healthRouter: Router = Router();

/**
 * GET /api/health
 *
 * Deliberately does not touch the database. This route answers "is the API
 * process alive", and a deploy platform will read it to decide whether to keep
 * the container running — conflating that with "is Postgres reachable" would
 * have a transient database blip restart a perfectly healthy server.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json(
    success({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );
});
