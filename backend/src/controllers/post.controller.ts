import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  createPost,
  deletePost,
  editComment,
  getPost,
  listPosts,
  POST_NOT_FOUND,
  retryConversion,
} from '../services/post.service.js';
import { requestDeadline } from '../services/requestDeadline.js';
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
/** Raw length is generous; the real limit applies after cleaning (edit-post-comment.md §4). */
const editCommentSchema = z.object({ comment: z.string().max(4000).nullable() }).strict();

/** The retry's optional body (conversion-auto-retry.md §4.4); no body is a manual retry. */
const retrySchema = z.object({ automatic: z.boolean().optional() }).strict();

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
  const deadline = requestDeadline();
  try {
    const communityId = parseCommunityId(req.params.id);
    const input = parseBody(createPostSchema, req.body);
    const post = await createPost(sessionUser(req), communityId, input, deadline);
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

/**
 * Validates the retry's body before the rate limiter, which reads the flag:
 * an automatic attempt skips the `conversion` tier (conversion-auto-retry.md §4.4).
 */
export const parseRetryBody: RequestHandler = (req, res, next) => {
  try {
    const { automatic = false } = parseBody(retrySchema, req.body ?? {});
    res.locals.automaticRetry = automatic;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/posts/:postId/conversion — anyone who can see a pending post
 * retries it; `{automatic: true}` is the author's app (conversion-auto-retry.md §4.4).
 */
export const retry: RequestHandler = async (req, res, next) => {
  const deadline = requestDeadline();
  try {
    const post = await retryConversion(
      sessionUser(req),
      parsePostId(req.params.postId),
      deadline,
      res.locals.automaticRetry === true,
    );
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

/** PATCH /api/posts/:postId/comment — the author only; the comment is all that changes. */
export const editPostComment: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const { comment } = parseBody(editCommentSchema, req.body);
    const post = await editComment(sessionUser(req), postId, comment);
    res.status(200).json(success({ post }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/posts/:postId — a current member; Post Detail's card. */
export const show: RequestHandler = async (req, res, next) => {
  try {
    const result = await getPost(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(result));
  } catch (error) {
    next(error);
  }
};
