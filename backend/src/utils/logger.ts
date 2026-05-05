/**
 * Centralised Pino logger instance.
 *
 * Rules (from system architecture conventions):
 *  - Levels: ERROR (action required) | WARN (suspicious / handled) | INFO (milestones) | DEBUG (local dev only)
 *  - Every log must include timestamp, level, context (module), and message.
 *  - Include `userId` in metadata when relevant; NEVER log passwords, raw tokens, or PII.
 *  - `console.log` is banned in committed code — use this logger instead.
 *
 * Usage:
 *   import { logger } from '../utils/logger.js';
 *   logger.info({ userId }, 'User registered');
 *   logger.error({ err }, 'Playwright scraper crashed');
 */

import pino from "pino";
import { env } from "../config/env.js";

// In development use pino-pretty for human-readable coloured output.
// In production emit raw JSON lines (structured, easy to ship to log aggregators).
// We build the options object separately to satisfy `exactOptionalPropertyTypes`.
const devTransport: pino.TransportSingleOptions = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss",
    ignore: "pid,hostname",
  },
};

export const logger = pino(
  env.NODE_ENV === "production"
    ? { level: env.LOG_LEVEL }
    : { level: env.LOG_LEVEL, transport: devTransport }
);
