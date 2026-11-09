import { Router } from 'express';

import { remove, save } from '../controllers/bookmark.controller.js';
import {
  create as createComment,
  list as listComments,
} from '../controllers/comment.controller.js';
import { destroy, editPostComment, retry, show } from '../controllers/post.controller.js';
import { edit, list, rate } from '../controllers/rating.controller.js';
import { conversionLimit } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const postsRouter: Router = Router();

postsRouter.post('/:postId/conversion', requireAuth, conversionLimit, retry);
postsRouter.delete('/:postId', requireAuth, destroy);
postsRouter.patch('/:postId/comment', requireAuth, editPostComment);
postsRouter.put('/:postId/bookmark', requireAuth, save);
postsRouter.delete('/:postId/bookmark', requireAuth, remove);
postsRouter.post('/:postId/ratings', requireAuth, rate);
postsRouter.get('/:postId', requireAuth, show);
postsRouter.get('/:postId/ratings', requireAuth, list);
postsRouter.patch('/:postId/rating', requireAuth, edit);
// The discussion (discussion-threads.md §4).
postsRouter.get('/:postId/comments', requireAuth, listComments);
postsRouter.post('/:postId/comments', requireAuth, createComment);
