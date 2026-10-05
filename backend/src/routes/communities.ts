import { Router } from 'express';

import { create, destroy, listMine, show, update } from '../controllers/community.controller.js';
import { resetCommunityInvite, showInvite } from '../controllers/invite.controller.js';
import {
  blocked,
  leave,
  members,
  remove,
  setRole,
  transfer,
  unblockUser,
} from '../controllers/membership.controller.js';
import { create as createPost, list as listPosts } from '../controllers/post.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const communitiesRouter: Router = Router();

// Guarded per route, not router-wide, so an unknown /communities path still 404s.
communitiesRouter.post('/', requireAuth, create);
communitiesRouter.get('/', requireAuth, listMine);
communitiesRouter.get('/:id', requireAuth, show);
communitiesRouter.patch('/:id', requireAuth, update);
communitiesRouter.delete('/:id', requireAuth, destroy);
communitiesRouter.get('/:id/members', requireAuth, members);
// Registered before '/:id/members/:userId', so "me" is never read as a user id.
communitiesRouter.delete('/:id/members/me', requireAuth, leave);
communitiesRouter.delete('/:id/members/:userId', requireAuth, remove);
communitiesRouter.patch('/:id/members/:userId', requireAuth, setRole);
communitiesRouter.post('/:id/ownership', requireAuth, transfer);
communitiesRouter.get('/:id/bans', requireAuth, blocked);
communitiesRouter.delete('/:id/bans/:userId', requireAuth, unblockUser);
communitiesRouter.get('/:id/invite', requireAuth, showInvite);
communitiesRouter.post('/:id/invite/reset', requireAuth, resetCommunityInvite);
communitiesRouter.get('/:id/posts', requireAuth, listPosts);
communitiesRouter.post('/:id/posts', requireAuth, createPost);
