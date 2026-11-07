import { Router } from 'express';

import { listMine } from '../controllers/bookmark.controller.js';
import {
  displayNameAvailability,
  updateMe,
  useGooglePicture,
} from '../controllers/user.controller.js';
import { profile, ratings, search } from '../controllers/profile.controller.js';
import { signInLimit } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const usersRouter: Router = Router();

// Guarded per route, not router-wide, so an unknown /users path still 404s.
usersRouter.patch('/me', requireAuth, updateMe);
// Limited first: it counts by address, so no session lookup is needed to refuse.
usersRouter.post('/me/google-picture', signInLimit, requireAuth, useGooglePicture);
usersRouter.get('/me/bookmarks', requireAuth, listMine);
usersRouter.get('/display-name-availability', requireAuth, displayNameAvailability);
usersRouter.get('/search', requireAuth, search);
// After every literal path above, so `me` or `search` never reads as an id.
usersRouter.get('/:userId', requireAuth, profile);
usersRouter.get('/:userId/ratings', requireAuth, ratings);
