import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';

import { env, isTest } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalLimit } from './middleware/rateLimits.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { notFound } from './middleware/notFound.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';
import { serializeRequest } from './utils/redactPath.js';
import { serializeError } from './utils/safeError.js';

/**
 * Builds the Express application without listening on a port, so that
 * Supertest can drive it in-process (docs/tests.md §2.3).
 * Binding to a port is `src/index.ts`'s job and nothing else's.
 */
export function createApp(): Express {
  const app = express();

  // Behind a host's proxy, req.ip is the client only if the proxy is trusted;
  // rate limits key on it (docs/features/production-hardening.md §3.2).
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(securityHeaders);

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // pino-http builds its own serializers, so the safe one is passed again.
        serializers: { req: serializeRequest, err: serializeError },
      }),
    );
  }

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      // Required for the session cookie (docs/features/google-auth.md §4).
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Before any route, so every /api request counts (except /api/health).
  app.use('/api', globalLimit, apiRouter);

  // Order matters: unmatched path first, then the single error writer.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
