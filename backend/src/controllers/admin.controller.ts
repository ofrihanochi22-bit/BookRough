import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { listCommunities, listUsers } from '../services/admin.service.js';
import {
  deleteCommunityAsAdmin,
  deleteUser,
  previewUserDeletion,
} from '../services/adminDelete.service.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { success } from '../utils/response.js';

const log = createLogger('admin');

/** GET /api/admin/users — behind requireAuth + requireAppAdmin. */
export const users: RequestHandler = async (req, res, next) => {
  try {
    const list = await listUsers();
    log.info({ userId: sessionUser(req).id, count: list.length }, 'Admin listed users');
    res.status(200).json(success({ users: list }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/admin/communities — behind requireAuth + requireAppAdmin. */
export const communities: RequestHandler = async (req, res, next) => {
  try {
    const list = await listCommunities();
    log.info({ userId: sessionUser(req).id, count: list.length }, 'Admin listed communities');
    res.status(200).json(success({ communities: list }));
  } catch (error) {
    next(error);
  }
};

const idSchema = z.string().uuid();

/** A malformed id is a 400 here (admin-delete.md §4): the admin may know every id anyway. */
function parseId(raw: unknown, what: 'user' | 'community'): string {
  const id = idSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(`That isn't a valid ${what} id.`, 400);
  }
  return id.data;
}

/** GET /api/admin/users/:userId/deletion-preview — what the "Are you sure?" dialog shows. */
export const userDeletionPreview: RequestHandler = async (req, res, next) => {
  try {
    const preview = await previewUserDeletion(sessionUser(req), parseId(req.params.userId, 'user'));
    res.status(200).json(success({ preview }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/admin/users/:userId — a full delete; owned communities are handed over. */
export const removeUser: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteUser(sessionUser(req), parseId(req.params.userId, 'user'));
    res.status(200).json(success(result));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/admin/communities/:communityId — every former member is told. */
export const removeCommunity: RequestHandler = async (req, res, next) => {
  try {
    await deleteCommunityAsAdmin(sessionUser(req), parseId(req.params.communityId, 'community'));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
