import { Router } from 'express';

import { displayNameAvailability, updateMe } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const usersRouter: Router = Router();

// Guarded per route, not router-wide, so an unknown /users path still 404s.
usersRouter.patch('/me', requireAuth, updateMe);
usersRouter.get('/display-name-availability', requireAuth, displayNameAvailability);
