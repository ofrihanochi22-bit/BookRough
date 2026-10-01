import type { RequestHandler } from 'express';
import { z } from 'zod';

import { authenticateWithGoogle } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { verifySessionToken } from '../utils/jwt.js';
import { createLogger } from '../utils/logger.js';
import { sessionPayload } from '../utils/publicUser.js';
import { success } from '../utils/response.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../utils/sessionCookie.js';
import { parseBody } from '../utils/validate.js';

const log = createLogger('auth');

const googleSignInSchema = z
  .object({
    credential: z.string().min(1).max(4096),
  })
  .strict();

/** POST /api/auth/google */
export const signInWithGoogle: RequestHandler = async (req, res, next) => {
  try {
    const { credential } = parseBody(googleSignInSchema, req.body);
    const { user, isNewUser } = await authenticateWithGoogle(credential);

    setSessionCookie(res, user.id);
    log.info({ userId: user.id, isNewUser }, 'Signed in');

    res.status(200).json(success(sessionPayload(user)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/auth/me — mounted behind requireAuth. */
export const getSession: RequestHandler = (req, res, next) => {
  if (!req.user) {
    next(new AppError('Please sign in.', 401));
    return;
  }

  res.status(200).json(success(sessionPayload(req.user)));
};

/**
 * POST /api/auth/logout — public and idempotent: signing out without a session
 * is not an error. The cookie is read only to name the user in the log.
 */
export const logout: RequestHandler = (req, res) => {
  const token = readSessionCookie(req);
  const claims = token ? verifySessionToken(token) : null;

  clearSessionCookie(res);
  if (claims) {
    log.info({ userId: claims.sub }, 'Signed out');
  }

  res.status(200).json(success(null));
};
