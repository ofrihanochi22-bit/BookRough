import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  COMMENT_MESSAGES,
  createComment,
  deleteComment,
  editComment,
  listComments,
} from '../services/comment.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';
import { parsePostId } from './post.controller.js';

/** Raw lengths are generous; the real limit applies after cleaning (discussion-threads.md §4). */
const createSchema = z
  .object({
    body: z.string().max(8000),
    ratingId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
    replyToId: z.string().uuid().optional(),
  })
  .strict();

const editSchema = z.object({ body: z.string().max(8000) }).strict();

const commentIdSchema = z.string().uuid();

/** A malformed id is the same 404 as a missing comment. */
function parseCommentId(raw: unknown): string {
  const id = commentIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(COMMENT_MESSAGES.notFound, 404);
  }
  return id.data;
}

/** GET /api/posts/:postId/comments */
export const list: RequestHandler = async (req, res, next) => {
  try {
    const comments = await listComments(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success({ comments }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/posts/:postId/comments */
export const create: RequestHandler = async (req, res, next) => {
  try {
    const postId = parsePostId(req.params.postId);
    const input = parseBody(createSchema, req.body);
    const comment = await createComment(sessionUser(req), postId, input);
    res.status(201).json(success({ comment }));
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/comments/:commentId — the author only. */
export const edit: RequestHandler = async (req, res, next) => {
  try {
    const commentId = parseCommentId(req.params.commentId);
    const { body } = parseBody(editSchema, req.body);
    const comment = await editComment(sessionUser(req), commentId, body);
    res.status(200).json(success({ comment }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/comments/:commentId — the author, or a community admin or owner. */
export const remove: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteComment(sessionUser(req), parseCommentId(req.params.commentId));
    res.status(200).json(success(result));
  } catch (error) {
    next(error);
  }
};
