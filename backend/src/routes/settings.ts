import { Router } from 'express';

import { publicSettings } from '../controllers/settings.controller.js';
import { optionalAuth } from '../middleware/requireAuth.js';

export const settingsRouter: Router = Router();

// Public: the accent colour and tagline are needed on Welcome, before sign-in.
// A session adds the announcement (docs/features/admin-panel.md §4.4).
settingsRouter.get('/', optionalAuth, publicSettings);
