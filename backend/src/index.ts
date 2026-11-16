import { createApp } from './app.js';
import { env } from './config/env.js';
import {
  listLocalMigrations,
  migrateOnStart,
  readAppliedMigrations,
  runPrismaDeploy,
} from './db/migrateOnStart.js';
import { prisma } from './db/prisma.js';
import { createLogger } from './utils/logger.js';
import { connectAndLog } from './utils/startupTiming.js';

const log = createLogger('server');
const startup = createLogger('startup');

// In the image only: bring the schema up to date before serving, starting
// Prisma's CLI only when something is pending
// (docs/features/migrate-check-on-start.md). A failed migration stops the
// process before it serves anything.
if (env.MIGRATE_ON_START) {
  const ready = await migrateOnStart({
    listLocal: () => listLocalMigrations(),
    readApplied: readAppliedMigrations,
    runDeploy: runPrismaDeploy,
    log: startup,
  });
  if (!ready) {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  // Cold-start measurement: process start to listening, the check included.
  const bootMs = Math.round(process.uptime() * 1000);
  log.info({ port: env.PORT, env: env.NODE_ENV, bootMs }, 'API listening');
  // The check already opened the connection and timed it (checkMs).
  if (!env.MIGRATE_ON_START) {
    void connectAndLog(() => prisma.$connect(), startup);
  }
});

function shutdown(signal: string): void {
  log.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
