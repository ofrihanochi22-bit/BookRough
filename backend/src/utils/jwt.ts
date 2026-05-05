/**
 * JWT helpers for the session cookie.
 *
 * All tokens are signed with the same secret and expiry so there is never
 * a mismatch between sign and verify options.  Import only these two
 * functions; never call jsonwebtoken directly from a controller or service.
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface SessionPayload {
  userId: string;
}

/**
 * Signs a new session token containing the user's ID.
 * Expiry comes from JWT_EXPIRES_IN env var (default 7d).
 */
export function signSession(userId: string): string {
  return jwt.sign({ userId } satisfies SessionPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifies and decodes a session token.
 * Throws `JsonWebTokenError` or `TokenExpiredError` on failure —
 * the auth middleware converts these to AppError(401).
 */
export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || !("userId" in decoded)) {
    throw new jwt.JsonWebTokenError("Unexpected token shape");
  }
  return { userId: decoded["userId"] as string };
}
