import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { listBookmarks, removeBookmark, saveBookmark } from '../services/bookmark.service.js';
import { success } from '../utils/response.js';
import { parseQuery } from '../utils/validate.js';
import { parsePostId } from './post.controller.js';

const listBookmarksQuerySchema = z.object({ before: z.string().max(200).optional() }).strict();

/** PUT /api/posts/:postId/bookmark — members, on someone else's post. Idempotent. */
export const save: RequestHandler = async (req, res, next) => {
  try {
    await saveBookmark(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/posts/:postId/bookmark — the caller's own bookmark. Idempotent. */
export const remove: RequestHandler = async (req, res, next) => {
  try {
    await removeBookmark(sessionUser(req), parsePostId(req.params.postId));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/me/bookmarks?before=<cursor> — My List. */
export const listMine: RequestHandler = async (req, res, next) => {
  try {
    const { before } = parseQuery(listBookmarksQuerySchema, req.query);
    const page = await listBookmarks(sessionUser(req), before);
    res.status(200).json(success(page));
  } catch (error) {
    next(error);
  }
};
