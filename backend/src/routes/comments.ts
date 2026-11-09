import { Router } from 'express';

import { edit, remove } from '../controllers/comment.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** A post's discussion, by comment — docs/features/discussion-threads.md §4 (UC-22). */
export const commentsRouter: Router = Router();

commentsRouter.patch('/:commentId', requireAuth, edit);
commentsRouter.delete('/:commentId', requireAuth, remove);
