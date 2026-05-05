/**
 * Server entrypoint — run with `npm run dev` (tsx watch) or `npm start` (compiled).
 *
 * Responsibilities:
 *   1. Validate environment variables (env.ts throws if they're wrong)
 *   2. Build the Express app
 *   3. Open the HTTP server
 *   4. Handle graceful shutdown on SIGINT / SIGTERM
 */

import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./db/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `🎵 BookRough API listening`
  );
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Close the HTTP server (stops accepting new connections) then disconnect Prisma.
// This ensures in-flight requests finish and no DB connections are left hanging.
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down…");

  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed. Goodbye.");
    process.exit(0);
  });

  // Force-exit if graceful shutdown takes too long
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
