import { Router } from 'express';

import { listMine } from '../controllers/bookmark.controller.js';
import {
  displayNameAvailability,
  updateMe,
  useGooglePicture,
} from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const usersRouter: Router = Router();

// Guarded per route, not router-wide, so an unknown /users path still 404s.
usersRouter.patch('/me', requireAuth, updateMe);
usersRouter.post('/me/google-picture', requireAuth, useGooglePicture);
usersRouter.get('/me/bookmarks', requireAuth, listMine);
usersRouter.get('/display-name-availability', requireAuth, displayNameAvailability);
