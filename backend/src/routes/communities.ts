import { Router } from 'express';

import { create, listMine, show } from '../controllers/community.controller.js';
import { resetCommunityInvite, showInvite } from '../controllers/invite.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const communitiesRouter: Router = Router();

// Guarded per route, not router-wide, so an unknown /communities path still 404s.
communitiesRouter.post('/', requireAuth, create);
communitiesRouter.get('/', requireAuth, listMine);
communitiesRouter.get('/:id', requireAuth, show);
communitiesRouter.get('/:id/invite', requireAuth, showInvite);
communitiesRouter.post('/:id/invite/reset', requireAuth, resetCommunityInvite);
