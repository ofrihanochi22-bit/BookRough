import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { ratePost } from '../services/rating.service.js';
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
