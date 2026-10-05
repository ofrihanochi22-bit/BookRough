import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  createPost,
  deletePost,
  listPosts,
  POST_NOT_FOUND,
  retryConversion,
} from '../services/post.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody, parseQuery } from '../utils/validate.js';
import { parseCommunityId } from './community.controller.js';

/** Raw lengths are generous; the real limits are applied after trimming and cleaning. */
const createPostSchema = z
  .object({
    url: z.string().max(4096),
    comment: z.string().max(4000).nullable().optional(),
  })
  .strict();

const listPostsQuerySchema = z.object({ before: z.string().max(200).optional() }).strict();

const postIdSchema = z.string().uuid();

/** A malformed post id is a 404 like any post the caller cannot see. */
export function parsePostId(raw: unknown): string {
  const id = postIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  return id.data;
}

/** POST /api/communities/:id/posts — members; waits for the conversion. */
export const create: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const input = parseBody(createPostSchema, req.body);
    const post = await createPost(sessionUser(req), communityId, input);
    res.status(201).json(success({ post }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/communities/:id/posts?before=<cursor> — members. */
export const list: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    const { before } = parseQuery(listPostsQuerySchema, req.query);
    const page = await listPosts(sessionUser(req), communityId, before);
    res.status(200).json(success(page));
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/:postId/conversion — the author retries a pending post. */
export const retry: RequestHandler = async (req, res, next) => {
  try {
    const post = await retryConversion(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success({ post }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/posts/:postId — the author, or an admin or the owner of its community. */
export const destroy: RequestHandler = async (req, res, next) => {
  try {
    await deletePost(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};
