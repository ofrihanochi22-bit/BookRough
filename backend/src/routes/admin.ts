import { Router } from 'express';

import {
  communities,
  removeCommunity,
  removeUser,
  userDeletionPreview,
  users,
} from '../controllers/admin.controller.js';
import { adminDeleteAvatar } from '../controllers/avatar.controller.js';
import { adminDeletePhoto } from '../controllers/communityPhoto.controller.js';
import { adminSnapshot, overview } from '../controllers/ops.controller.js';
import { adminSettings, changeSettings } from '../controllers/settings.controller.js';
import { requireAppAdmin } from '../middleware/requireAppAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const adminRouter: Router = Router();

// Both guards on every route, server-side (CLAUDE.md §17). Per route, not
// router-wide, so an unknown /admin path still 404s like any other.
// Admin → Overview and the skills' snapshots (docs/features/admin-overview.md §4.1–4.2).
adminRouter.get('/overview', requireAuth, requireAppAdmin, overview);
adminRouter.post('/ops/snapshots', requireAuth, requireAppAdmin, adminSnapshot);
adminRouter.get('/users', requireAuth, requireAppAdmin, users);
adminRouter.get('/communities', requireAuth, requireAppAdmin, communities);
adminRouter.get('/settings', requireAuth, requireAppAdmin, adminSettings);
adminRouter.patch('/settings', requireAuth, requireAppAdmin, changeSettings);
// The one write on users (avatar-upload.md D2; CLAUDE.md §17 amended).
adminRouter.delete('/users/:userId/avatar', requireAuth, requireAppAdmin, adminDeleteAvatar);
// The two deletes (admin-delete.md; CLAUDE.md §17 amended). An ADMIN target is refused in the service.
adminRouter.get(
  '/users/:userId/deletion-preview',
  requireAuth,
  requireAppAdmin,
  userDeletionPreview,
);
adminRouter.delete('/users/:userId', requireAuth, requireAppAdmin, removeUser);
adminRouter.delete('/communities/:communityId', requireAuth, requireAppAdmin, removeCommunity);
// Remove a community's photo (community-photo.md D2).
adminRouter.delete(
  '/communities/:communityId/photo',
  requireAuth,
  requireAppAdmin,
  adminDeletePhoto,
);
