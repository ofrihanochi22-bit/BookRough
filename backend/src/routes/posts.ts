import { Router } from 'express';

import { retry } from '../controllers/post.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const postsRouter: Router = Router();

postsRouter.post('/:postId/conversion', requireAuth, retry);
