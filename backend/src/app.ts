/**
 * Express application factory.
 *
 * Exported as `createApp()` so integration tests can spin up a fresh app
 * instance without starting a real HTTP server (Supertest handles that).
 *
 * Middleware order is intentional:
 *   1. cors       — must come before any routes so preflight OPTIONS works
 *   2. cookieParser — parses Cookie header (needed by requireAuth in Phase 1)
 *   3. express.json — parse request bodies
 *   4. pinoHttp   — request/response logging (after parsers so body is available)
 *   5. Routes
 *   6. 404 handler — catches unmatched routes
 *   7. Error handler — MUST be last (4 args signals it to Express)
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { apiRouter } from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // ── CORS ────────────────────────────────────────────────────────────────────
  // credentials: true is required for the JWT HttpOnly cookie to travel with requests
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    })
  );

  // ── Body / cookie parsing ─────────────────────────────────────────────────
  app.use(cookieParser());
  app.use(express.json());

  // ── Structured HTTP logging ───────────────────────────────────────────────
  // Skips logging health-check requests to avoid noise in the terminal
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/api/health",
      },
    })
  );

  // ── Feature routes ────────────────────────────────────────────────────────
  app.use("/api", apiRouter);

  // ── 404 & error handling (must be last) ──────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
