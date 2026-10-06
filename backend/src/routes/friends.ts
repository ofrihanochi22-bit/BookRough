import { Router } from 'express';

import {
  accept,
  cancel,
  friends,
  ignore,
  requestCount,
  requests,
  send,
} from '../controllers/friend.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Friend requests and friends — docs/features/friend-requests.md §4. */
export const friendsRouter: Router = Router();

friendsRouter.get('/', requireAuth, friends);
friendsRouter.get('/requests', requireAuth, requests);
friendsRouter.get('/requests/count', requireAuth, requestCount);
friendsRouter.post('/requests', requireAuth, send);
friendsRouter.delete('/requests/sent/:userId', requireAuth, cancel);
friendsRouter.post('/requests/:userId/accept', requireAuth, accept);
friendsRouter.post('/requests/:userId/ignore', requireAuth, ignore);
