import { Router } from 'express';

import { communities, users } from '../controllers/admin.controller.js';
import { requireAppAdmin } from '../middleware/requireAppAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const adminRouter: Router = Router();

// Both guards on every route, server-side (CLAUDE.md §17). Per route, not
// router-wide, so an unknown /admin path still 404s like any other.
adminRouter.get('/users', requireAuth, requireAppAdmin, users);
adminRouter.get('/communities', requireAuth, requireAppAdmin, communities);
