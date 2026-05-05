/**
 * Express middleware that enforces authentication.
 *
 * Reads the session JWT from the HttpOnly cookie, verifies it, and attaches
 * `req.user = { id }` so downstream handlers know who is calling.
 *
 * Must be applied per-route (not globally) so that public routes like
 * /api/health, POST /api/auth/login, etc. remain accessible without a token.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { SESSION_COOKIE } from "../utils/cookies.js";
import { verifySession } from "../utils/jwt.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies[SESSION_COOKIE] as string | undefined;

  if (!token) {
    next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
    return;
  }

  try {
    const payload = verifySession(token);
    req.user = { id: payload.userId };
    next();
  } catch {
    next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  }
}
