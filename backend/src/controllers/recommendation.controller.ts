import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  countUnseen,
  hideRecommendation,
  listReceived,
  listSent,
  markSeen,
  sendRecommendation,
} from '../services/recommendation.service.js';
import { success } from '../utils/response.js';
import { parseBody, parseQuery } from '../utils/validate.js';
import { parsePostId } from './post.controller.js';

/** Raw lengths are generous; the real limits are applied after trimming and cleaning. */
const sendSchema = z
  .object({
    recipientId: z.string().uuid(),
    url: z.string().max(4096),
    comment: z.string().max(4000).nullable().optional(),
  })
  .strict();

const listQuerySchema = z.object({ before: z.string().max(200).optional() }).strict();

/** POST /api/recommendations — UC-20; friends only; waits for the conversion. */
export const send: RequestHandler = async (req, res, next) => {
  try {
    const input = parseBody(sendSchema, req.body);
    const post = await sendRecommendation(sessionUser(req), input);
    res.status(201).json(success({ post }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/recommendations/received?before=<cursor> */
export const received: RequestHandler = async (req, res, next) => {
  try {
    const { before } = parseQuery(listQuerySchema, req.query);
    res.status(200).json(success(await listReceived(sessionUser(req), before)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/recommendations/sent?before=<cursor> */
export const sent: RequestHandler = async (req, res, next) => {
  try {
    const { before } = parseQuery(listQuerySchema, req.query);
    res.status(200).json(success(await listSent(sessionUser(req), before)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/recommendations/unseen-count — the Friends tab's badge. */
export const unseenCount: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ count: await countUnseen(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/recommendations/seen — opening Received clears the count. */
export const seen: RequestHandler = async (req, res, next) => {
  try {
    await markSeen(sessionUser(req));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** PUT /api/recommendations/:postId/hidden — the recipient only. */
export const hide: RequestHandler = async (req, res, next) => {
  try {
    await hideRecommendation(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};
