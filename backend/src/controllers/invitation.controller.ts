import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  acceptInvitation,
  cancelInvitation,
  countMyInvitations,
  declineInvitation,
  INVITATION_GONE,
  inviteFriends,
  listCandidates,
  listMyInvitations,
  MAX_INVITES,
} from '../services/invitation.service.js';
import { USER_NOT_FOUND } from '../services/profile.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';
import { parseCommunityId } from './community.controller.js';

const inviteSchema = z
  .object({ userIds: z.array(z.string().uuid()).min(1).max(MAX_INVITES) })
  .strict();
const idSchema = z.string().uuid();

/** A malformed id in a path is "not found", like an unknown one (invite-friends.md §4). */
function parseId(raw: unknown, notFound: string): string {
  const id = idSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(notFound, 404);
  }
  return id.data;
}

/** GET /api/communities/:id/invitations/candidates — admins. */
export const candidates: RequestHandler = async (req, res, next) => {
  try {
    const list = await listCandidates(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ candidates: list }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/communities/:id/invitations — admins invite friends. */
export const invite: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const { userIds } = parseBody(inviteSchema, req.body);
    const list = await inviteFriends(sessionUser(req), communityId, userIds);
    res.status(200).json(success({ candidates: list }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id/invitations/:userId — admins withdraw one. */
export const cancel: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const inviteeId = parseId(req.params.userId, USER_NOT_FOUND);
    const list = await cancelInvitation(sessionUser(req), communityId, inviteeId);
    res.status(200).json(success({ candidates: list }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/invitations — the caller's pending invitations. */
export const mine: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ invitations: await listMyInvitations(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/invitations/count — for the Friends badge. */
export const count: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ count: await countMyInvitations(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/invitations/:communityId/accept — join. */
export const accept: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseId(req.params.communityId, INVITATION_GONE);
    const community = await acceptInvitation(sessionUser(req), communityId);
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/invitations/:communityId/decline — silent. */
export const decline: RequestHandler = async (req, res, next) => {
  try {
    await declineInvitation(sessionUser(req), parseId(req.params.communityId, INVITATION_GONE));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};
