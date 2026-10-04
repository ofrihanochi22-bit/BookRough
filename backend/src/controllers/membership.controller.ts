import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  MEMBER_NOT_FOUND,
  NOT_BLOCKED,
  changeRole,
  leaveCommunity,
  listBlocked,
  listMembers,
  removeMember,
  transferOwnership,
  unblock,
} from '../services/membership.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';
import { parseCommunityId } from './community.controller.js';

const userIdSchema = z.string().uuid();

/** A malformed user id is "not found", like an unknown one — never a 422 or a 500. */
function parseUserId(raw: unknown, notFound: string): string {
  const id = userIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(notFound, 404);
  }
  return id.data;
}

/** OWNER is deliberately absent: ownership only moves through a transfer. */
const roleSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) }).strict();
const transferSchema = z.object({ userId: z.string().uuid() }).strict();

/** GET /api/communities/:id/members — any member. */
export const members: RequestHandler = async (req, res, next) => {
  try {
    const list = await listMembers(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ members: list }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id/members/me — leave. */
export const leave: RequestHandler = async (req, res, next) => {
  try {
    await leaveCommunity(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id/members/:userId — remove and block (admins). */
export const remove: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    await removeMember(
      sessionUser(req),
      communityId,
      parseUserId(req.params.userId, MEMBER_NOT_FOUND),
    );
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/communities/:id/members/:userId — promote or demote (admins). */
export const setRole: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const targetUserId = parseUserId(req.params.userId, MEMBER_NOT_FOUND);
    const { role } = parseBody(roleSchema, req.body);
    const member = await changeRole(sessionUser(req), communityId, targetUserId, role);
    res.status(200).json(success({ member }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/communities/:id/ownership — the owner hands over ownership. */
export const transfer: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const { userId } = parseBody(transferSchema, req.body);
    const community = await transferOwnership(sessionUser(req), communityId, userId);
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/communities/:id/bans — admins. */
export const blocked: RequestHandler = async (req, res, next) => {
  try {
    const list = await listBlocked(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ blocked: list }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id/bans/:userId — admins. */
export const unblockUser: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    await unblock(sessionUser(req), communityId, parseUserId(req.params.userId, NOT_BLOCKED));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};
