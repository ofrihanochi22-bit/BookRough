import { Router } from 'express';

import { remove, save } from '../controllers/bookmark.controller.js';
import { destroy, retry, show } from '../controllers/post.controller.js';
import { edit, list, rate } from '../controllers/rating.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const postsRouter: Router = Router();

postsRouter.post('/:postId/conversion', requireAuth, retry);
postsRouter.delete('/:postId', requireAuth, destroy);
postsRouter.put('/:postId/bookmark', requireAuth, save);
postsRouter.delete('/:postId/bookmark', requireAuth, remove);
postsRouter.post('/:postId/ratings', requireAuth, rate);
postsRouter.get('/:postId', requireAuth, show);
postsRouter.get('/:postId/ratings', requireAuth, list);
postsRouter.patch('/:postId/rating', requireAuth, edit);
