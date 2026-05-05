/**
 * Session cookie helpers.
 *
 * The cookie name and policy live here so every place that touches the cookie
 * (set on login/register, clear on logout, read by requireAuth) stays in sync
 * automatically.
 */

import type { Response } from "express";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "bookrough_session";

/** Writes the session JWT into an HttpOnly cookie on the response. */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? "none" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    // maxAge mirrors the JWT lifetime so the cookie and token expire together
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
}

/** Clears the session cookie (sets it to expire in the past). */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? "none" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
  });
}
