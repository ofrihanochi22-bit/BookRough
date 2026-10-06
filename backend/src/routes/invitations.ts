import { Router } from 'express';

import { accept, count, decline, mine } from '../controllers/invitation.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The caller's invitations to communities — docs/features/invite-friends.md §4. */
export const invitationsRouter: Router = Router();

invitationsRouter.get('/', requireAuth, mine);
invitationsRouter.get('/count', requireAuth, count);
invitationsRouter.post('/:communityId/accept', requireAuth, accept);
invitationsRouter.post('/:communityId/decline', requireAuth, decline);
