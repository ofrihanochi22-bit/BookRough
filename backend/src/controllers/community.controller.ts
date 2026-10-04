import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  COMMUNITY_NOT_FOUND,
  createCommunity,
  deleteCommunity,
  getCommunity,
  listMyCommunities,
  updateCommunity,
} from '../services/community.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';

/** Raw lengths are generous; the real limits are applied after cleaning. */
const createCommunitySchema = z
  .object({
    name: z.string().max(400),
    description: z.string().max(4000).nullable().optional(),
  })
  .strict();

/** At least one key; `description: null` (or blank) clears it. */
const updateCommunitySchema = z
  .object({
    name: z.string().max(400).optional(),
    description: z.string().max(4000).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);

const communityIdSchema = z.string().uuid();

/**
 * A malformed community id is a 404 like any other community the caller cannot
 * see — never a 422 that would tell ids apart.
 */
export function parseCommunityId(raw: unknown): string {
  const id = communityIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(COMMUNITY_NOT_FOUND, 404);
  }
  return id.data;
}

/** POST /api/communities — mounted behind requireAuth. */
export const create: RequestHandler = async (req, res, next) => {
  try {
    const input = parseBody(createCommunitySchema, req.body);
    const community = await createCommunity(sessionUser(req), input);
    res.status(201).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/communities — the caller's own communities only. */
export const listMine: RequestHandler = async (req, res, next) => {
  try {
    const communities = await listMyCommunities(sessionUser(req));
    res.status(200).json(success({ communities }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/communities/:id — members only. */
export const show: RequestHandler = async (req, res, next) => {
  try {
    const community = await getCommunity(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/communities/:id — admins edit the name and description. */
export const update: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const changes = parseBody(updateCommunitySchema, req.body);
    const community = await updateCommunity(sessionUser(req), communityId, changes);
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id — the owner only; final. */
export const destroy: RequestHandler = async (req, res, next) => {
  try {
    await deleteCommunity(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};
