import { Router } from 'express';

import { list, read, readAll, unreadCount } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The notification center — docs/features/notifications.md §4 (UC-21). Tier 4 only. */
export const notificationsRouter: Router = Router();

notificationsRouter.get('/', requireAuth, list);
notificationsRouter.get('/unread-count', requireAuth, unreadCount);
notificationsRouter.post('/read-all', requireAuth, readAll);
notificationsRouter.post('/:id/read', requireAuth, read);
