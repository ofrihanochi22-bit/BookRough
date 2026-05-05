/**
 * Auth route handlers (controllers).
 *
 * Each handler follows the same pattern:
 *   1. Parse + validate the request body with Zod (throws ZodError → 400).
 *   2. Call the relevant service function (throws AppError on business failures).
 *   3. Set / clear the session cookie.
 *   4. Return a standardised response via ok() / fail().
 *
 * Controllers never contain business logic — that lives in auth.service.ts.
 */

import type { Request, Response, NextFunction } from "express";
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotSchema,
  resetSchema,
} from "../validation/auth.schema.js";
import {
  registerWithPassword,
  loginWithPassword,
  getUserById,
  loginOrCreateGoogleUser,
} from "../services/auth.service.js";
import { verifyGoogleIdToken } from "../services/google.service.js";
import { signSession } from "../utils/jwt.js";
import { setSessionCookie, clearSessionCookie } from "../utils/cookies.js";
import { ok } from "../utils/response.js";
import {
  requestReset,
  resetWithToken,
} from "../services/passwordReset.service.js";

/** POST /api/auth/register */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerWithPassword(input);
    const token = signSession(user.id);
    setSessionCookie(res, token);
    ok(res, { user }, 201);
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/login */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await loginWithPassword(email, password);
    const token = signSession(user.id);
    setSessionCookie(res, token);
    ok(res, { user });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/logout — public, no auth required; just clears the cookie */
export function logout(req: Request, res: Response): void {
  void req; // not used but kept for express signature consistency
  clearSessionCookie(res);
  ok(res, { message: "Logged out" });
}

/** POST /api/auth/google — verify Google ID token, find-or-create user, issue session */
export async function googleLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { idToken } = googleLoginSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(idToken);
    const user = await loginOrCreateGoogleUser({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    const token = signSession(user.id);
    setSessionCookie(res, token);
    ok(res, { user, requiresOnboarding: !user.profileComplete });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot
 *
 * Always returns the same 200 to prevent email enumeration.
 * The reset URL is currently logged to stdout (dev only).
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = forgotSchema.parse(req.body);
    await requestReset(email);
    ok(res, {
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset
 *
 * Validates the token, updates the password, and burns the token.
 * Returns 400 on invalid/expired tokens, 200 on success.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, newPassword } = resetSchema.parse(req.body);
    await resetWithToken(token, newPassword);
    ok(res, { message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me — requires requireAuth middleware upstream */
export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // req.user is guaranteed by requireAuth — the type says it could be
    // undefined but we only wire this handler behind requireAuth.
    const userId = req.user!.id;
    const user = await getUserById(userId);
    ok(res, { user });
  } catch (err) {
    next(err);
  }
}
