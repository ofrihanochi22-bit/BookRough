import { Router } from 'express';

import {
  hide,
  received,
  seen,
  send,
  sent,
  unseenCount,
} from '../controllers/recommendation.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Direct recommendations between friends — docs/features/direct-recommendations.md §4. */
export const recommendationsRouter: Router = Router();

recommendationsRouter.post('/', requireAuth, send);
recommendationsRouter.get('/received', requireAuth, received);
recommendationsRouter.get('/sent', requireAuth, sent);
recommendationsRouter.get('/unseen-count', requireAuth, unseenCount);
recommendationsRouter.post('/seen', requireAuth, seen);
recommendationsRouter.put('/:postId/hidden', requireAuth, hide);
