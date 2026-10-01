import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

/** docs/features/google-auth.md §4 — 30 days, renewed once past half-life. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const RENEW_AFTER_SECONDS = SESSION_TTL_SECONDS / 2;

export interface SessionClaims {
  /** The user's id. Nothing else rides in the token: role and profile are read fresh from the database. */
  sub: string;
  iat: number;
  exp: number;
}

export function signSessionToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Returns the claims of a valid token, or null for anything else — malformed,
 * expired, or signed with another secret. Callers treat every one of those the
 * same way, so the reason is not surfaced.
 */
export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** True once a token has lived past half its lifetime (sliding renewal). */
export function shouldRenew(
  claims: SessionClaims,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  return nowSeconds - claims.iat > RENEW_AFTER_SECONDS;
}
