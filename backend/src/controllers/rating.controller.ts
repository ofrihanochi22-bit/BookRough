import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { editRating, listPostRatings, ratePost } from '../services/rating.service.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';
import { parsePostId } from './post.controller.js';

/** The score is checked by the service, which owns its message; the raw comment length is generous. */
const ratePostSchema = z
  .object({
    score: z.unknown(),
    comment: z.string().max(4000).nullable().optional(),
  })
  .strict();

/** At least one key; the score is checked by the service, as when rating. */
const editRatingSchema = z
  .object({
    score: z.unknown(),
    comment: z.string().max(4000).nullable().optional(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0);

/** POST /api/posts/:postId/ratings — a current member, on someone else's post, once. */
export const rate: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const input = parseBody(ratePostSchema, req.body);
    const rating = await ratePost(sessionUser(req), postId, input);
    res.status(201).json(success({ rating }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/posts/:postId/ratings — a current member; every rating, newest first. */
export const list: RequestHandler = async (req, res, next) => {
  try {
    const result = await listPostRatings(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(result));
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/posts/:postId/rating — a current member edits their own rating. */
export const edit: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const changes = parseBody(editRatingSchema, req.body);
    const rating = await editRating(sessionUser(req), postId, changes);
    res.status(200).json(success({ rating }));
  } catch (error) {
    next(error);
  }
};
