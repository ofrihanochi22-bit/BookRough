import type { User } from '@prisma/client';
import type { Request, RequestHandler } from 'express';

import { findSessionUser } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { shouldRenew, verifySessionToken } from '../utils/jwt.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../utils/sessionCookie.js';

const SIGN_IN_REQUIRED = 'Please sign in.';

/**
 * Resolves the session cookie to a user row and attaches it as `req.user`.
 *
 * The row is loaded on every request rather than trusted from the token, so a
 * deleted account is locked out immediately. A token past half its lifetime is
 * quietly re-issued: the 30-day session slides while the app is in use.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionCookie(req);
  if (!token) {
    next(new AppError(SIGN_IN_REQUIRED, 401));
    return;
  }

  const claims = verifySessionToken(token);
  if (!claims) {
    clearSessionCookie(res);
    next(new AppError(SIGN_IN_REQUIRED, 401));
    return;
  }

  try {
    const user = await findSessionUser(claims.sub);
    if (!user) {
      clearSessionCookie(res);
      next(new AppError(SIGN_IN_REQUIRED, 401));
      return;
    }

    if (shouldRenew(claims)) {
      setSessionCookie(res, user.id);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * The signed-in user of a route mounted behind `requireAuth`. Throws a 401
 * rather than returning undefined, so a route that forgot the middleware fails
 * closed instead of acting on nobody.
 */
export function sessionUser(req: Request): User {
  if (!req.user) {
    throw new AppError(SIGN_IN_REQUIRED, 401);
  }
  return req.user;
}
