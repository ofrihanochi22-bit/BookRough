import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { createLogger } from './utils/logger.js';
import { connectAndLog, startupTimings } from './utils/startupTiming.js';

const log = createLogger('server');
const startup = createLogger('startup');
const app = createApp();

const server = app.listen(env.PORT, () => {
  // Cold-start measurement (docs/features/client-cache.md §4.1).
  const { migrateMs, bootMs } = startupTimings(process.env, Date.now(), process.uptime() * 1000);
  if (migrateMs !== undefined) {
    startup.info({ migrateMs }, 'Migrations finished');
  }
  log.info({ port: env.PORT, env: env.NODE_ENV, bootMs }, 'API listening');
  void connectAndLog(() => prisma.$connect(), startup);
});

function shutdown(signal: string): void {
  log.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
