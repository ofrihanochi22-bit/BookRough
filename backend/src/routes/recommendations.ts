import { Router } from 'express';

import {
  check,
  hide,
  received,
  seen,
  send,
  sent,
  uncheck,
  unchecked,
  uncheckedCount,
  unseenCount,
} from '../controllers/recommendation.controller.js';
import { conversionLimit } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Direct recommendations between friends — docs/features/direct-recommendations.md §4. */
export const recommendationsRouter: Router = Router();

recommendationsRouter.post('/', requireAuth, conversionLimit, send);
recommendationsRouter.get('/received', requireAuth, received);
recommendationsRouter.get('/sent', requireAuth, sent);
recommendationsRouter.get('/unseen-count', requireAuth, unseenCount);
recommendationsRouter.post('/seen', requireAuth, seen);
recommendationsRouter.put('/:postId/hidden', requireAuth, hide);

// From communities — docs/features/community-unchecked.md §4.
recommendationsRouter.get('/community', requireAuth, unchecked);
recommendationsRouter.get('/community/count', requireAuth, uncheckedCount);
recommendationsRouter.put('/community/:postId/checked', requireAuth, check);
recommendationsRouter.delete('/community/:postId/checked', requireAuth, uncheck);
