import { Router } from 'express';

import {
  archive,
  archived,
  archivedCount,
  check,
  received,
  seen,
  send,
  sent,
  unarchive,
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

// The archive — docs/features/archive-recommendations.md §4. It replaced
// PUT /:postId/hidden, which is gone (an old shell gets 404 until it reloads).
recommendationsRouter.get('/archived', requireAuth, archived);
recommendationsRouter.get('/archived/count', requireAuth, archivedCount);
recommendationsRouter.put('/:postId/archived', requireAuth, archive);
recommendationsRouter.delete('/:postId/archived', requireAuth, unarchive);

// From communities — docs/features/community-unchecked.md §4.
recommendationsRouter.get('/community', requireAuth, unchecked);
recommendationsRouter.get('/community/count', requireAuth, uncheckedCount);
recommendationsRouter.put('/community/:postId/checked', requireAuth, check);
recommendationsRouter.delete('/community/:postId/checked', requireAuth, uncheck);
