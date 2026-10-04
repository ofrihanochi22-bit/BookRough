import { Router } from 'express';

import { accept, preview } from '../controllers/invite.controller.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';

export const invitesRouter: Router = Router();

// The preview is public on purpose (docs/features/communities-invites.md §4):
// the token is the secret, and a session only answers "am I already in?".
invitesRouter.get('/:token', optionalAuth, preview);
invitesRouter.post('/:token/accept', requireAuth, accept);
