/**
 * Central Express error-handling middleware.
 *
 * Must be registered LAST in app.ts — after all routes and the 404 handler.
 * Express identifies it as an error handler by its 4-argument signature.
 *
 * Handles three error types in order:
 *   1. AppError   — predictable, user-facing (4xx / safe 5xx messages)
 *   2. ZodError   — validation failure from a controller parsing request input
 *   3. Everything else — unexpected; logged as ERROR, returns a generic 500
 *
 * Rules:
 *   - Never leak stack traces or raw DB errors to the client.
 *   - Always log unexpected errors so they show up in monitoring.
 *   - ZodError is converted to a 400 with the first validation issue's message.
 */

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";
import { fail } from "../utils/response.js";
import { logger } from "../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── Known, user-facing error ─────────────────────────────────────────────
  if (err instanceof AppError) {
    // Only log server-side faults (5xx); 4xx are expected user errors
    if (err.statusCode >= 500) {
      logger.error({ err }, "Application error");
    }
    fail(res, err.statusCode, err.message, err.code);
    return;
  }

  // ── Zod validation failure ───────────────────────────────────────────────
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.length ? firstIssue.path.join(".") + ": " : ""}${firstIssue.message}`
      : "Validation error";
    fail(res, 400, message, "VALIDATION_ERROR");
    return;
  }

  // ── Unexpected error ─────────────────────────────────────────────────────
  logger.error({ err }, "Unhandled error");
  fail(res, 500, "An unexpected error occurred. Please try again.");
}
