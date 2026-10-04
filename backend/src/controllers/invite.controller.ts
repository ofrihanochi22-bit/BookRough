import type { RequestHandler } from 'express';

import { sessionUser } from '../middleware/requireAuth.js';
import { acceptInvite, getInvite, previewInvite, resetInvite } from '../services/invite.service.js';
import { success } from '../utils/response.js';
import { parseCommunityId } from './community.controller.js';

/** GET /api/communities/:id/invite — admins only. */
export const showInvite: RequestHandler = async (req, res, next) => {
  try {
    const invite = await getInvite(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ invite }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/communities/:id/invite/reset — admins only; no body. */
export const resetCommunityInvite: RequestHandler = async (req, res, next) => {
  try {
    const invite = await resetInvite(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ invite }));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invites/:token — public, mounted behind optionalAuth. The token's
 * shape is checked by the service, which answers 404 for anything malformed.
 */
export const preview: RequestHandler = async (req, res, next) => {
  try {
    const invite = await previewInvite(req.params.token, req.user ?? null);
    res.status(200).json(success({ invite }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/invites/:token/accept — mounted behind requireAuth; no body. */
export const accept: RequestHandler = async (req, res, next) => {
  try {
    const result = await acceptInvite(sessionUser(req), req.params.token);
    res.status(200).json(success(result));
  } catch (error) {
    next(error);
  }
};
