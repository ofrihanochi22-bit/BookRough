import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  COMMUNITY_NOT_FOUND,
  createCommunity,
  getCommunity,
  listMyCommunities,
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
