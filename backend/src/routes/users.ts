import { Router } from 'express';

import { displayNameAvailability, updateMe } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const usersRouter: Router = Router();

usersRouter.use(requireAuth);
usersRouter.patch('/me', updateMe);
usersRouter.get('/display-name-availability', displayNameAvailability);
