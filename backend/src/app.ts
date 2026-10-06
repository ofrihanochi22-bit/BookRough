import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';

import { env, isTest } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';
import { redactPath } from './utils/redactPath.js';

/**
 * Builds the Express application without listening on a port, so that
 * Supertest can drive it in-process (docs/tests.md §2.3).
 * Binding to a port is `src/index.ts`'s job and nothing else's.
 */
export function createApp(): Express {
  const app = express();

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Request lines carry the URL; an invite token or a searched name in it
        // must not reach the log, nor through the parsed query and params.
        serializers: {
          req: ({ query: _query, params: _params, ...req }: Record<string, unknown>) => ({
            ...req,
            url: redactPath(String(req.url)),
          }),
        },
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

  app.use('/api', apiRouter);

  // Order matters: unmatched path first, then the single error writer.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
