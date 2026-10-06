import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  EMPTY_QUERY,
  getProfile,
  listProfileRatings,
  searchUsers,
  USER_NOT_FOUND,
} from '../services/profile.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseQuery } from '../utils/validate.js';

const searchQuerySchema = z.object({ q: z.string().max(200).optional() }).strict();
const listRatingsQuerySchema = z.object({ before: z.string().max(200).optional() }).strict();
const userIdSchema = z.string().uuid();

/** A malformed user id is a 404 like an unknown one (docs/features/find-people.md §4). */
function parseProfileId(raw: unknown): string {
  const id = userIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(USER_NOT_FOUND, 404);
  }
  return id.data;
}

/** GET /api/users/search?q= — UC-5. A missing `q` reads as an empty search. */
export const search: RequestHandler = async (req, res, next) => {
  try {
    const { q } = parseQuery(searchQuerySchema, req.query);
    if (q === undefined) {
      throw new AppError(EMPTY_QUERY, 422);
    }
    res.status(200).json(success(await searchUsers(sessionUser(req), q)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/:userId — a Public Profile. */
export const profile: RequestHandler = async (req, res, next) => {
  try {
    const user = await getProfile(sessionUser(req), parseProfileId(req.params.userId));
    res.status(200).json(success({ user }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/:userId/ratings?before=<cursor> — their ratings in shared communities. */
export const ratings: RequestHandler = async (req, res, next) => {
  try {
    const userId = parseProfileId(req.params.userId);
    const { before } = parseQuery(listRatingsQuerySchema, req.query);
    res.status(200).json(success(await listProfileRatings(sessionUser(req), userId, before)));
  } catch (error) {
    next(error);
  }
};
