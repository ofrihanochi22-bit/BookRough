import type { CookieOptions, Request, Response } from 'express';

import { env } from '../config/env.js';
import { SESSION_TTL_SECONDS, signSessionToken } from './jwt.js';

export const SESSION_COOKIE = 'token';

/**
 * `Secure` is off outside production only because Safari refuses Secure cookies
 * on http://localhost. `Lax` works in development because localhost:5173 and
 * localhost:4000 are the same site — and it is why production must serve the
 * frontend and the API from the same site too (docs/features/google-auth.md §4).
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(SESSION_COOKIE, signSessionToken(userId), {
    ...baseOptions,
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseOptions);
}

/** The raw cookie value, or null when absent or not a string. */
export function readSessionCookie(req: Request): string | null {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
