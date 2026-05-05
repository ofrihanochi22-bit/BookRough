/**
 * 404 catch-all middleware.
 *
 * Registered after all routes but before the error handler.
 * Passes an AppError into the error handler so the response shape is
 * identical to other errors — no ad-hoc `res.json` here.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("Route not found", 404, "NOT_FOUND"));
}
