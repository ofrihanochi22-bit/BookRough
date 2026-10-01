import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');
const app = createApp();

const server = app.listen(env.PORT, () => {
  log.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

function shutdown(signal: string): void {
  log.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
