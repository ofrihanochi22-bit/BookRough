import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError.js';
import { isAppAdmin } from '../utils/publicUser.js';
import { sessionUser } from './requireAuth.js';

export const NO_ADMIN_ACCESS = "You don't have access to this.";

/**
 * Gates every /api/admin route (CLAUDE.md §17). Mounted after requireAuth, so
 * the role comes from the user row loaded for this request — never from the
 * token — and a role removed in the database is refused on the next request.
 * Named apart from the community-level requireAdmin in communityAccess.ts.
 */
export const requireAppAdmin: RequestHandler = (req, _res, next) => {
  try {
    if (!isAppAdmin(sessionUser(req))) {
      throw new AppError(NO_ADMIN_ACCESS, 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};
