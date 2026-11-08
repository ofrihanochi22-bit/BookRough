import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  countUnread,
  listNotifications,
  markAllRead,
  markRead,
  NOTIFICATION_NOT_FOUND,
} from '../services/notification.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseQuery } from '../utils/validate.js';

const listQuerySchema = z.object({ before: z.string().max(200).optional() }).strict();
const idSchema = z.string().uuid();

/** A malformed id is the same 404 as a missing one, like posts. */
function parseNotificationId(raw: unknown): string {
  const id = idSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(NOTIFICATION_NOT_FOUND, 404);
  }
  return id.data;
}

/** GET /api/notifications?before=<cursor> — docs/features/notifications.md §4. */
export const list: RequestHandler = async (req, res, next) => {
  try {
    const { before } = parseQuery(listQuerySchema, req.query);
    res.status(200).json(success(await listNotifications(sessionUser(req), before)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/notifications/unread-count — the Home tab's badge. */
export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ count: await countUnread(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/notifications/:id/read — the reader's own only. */
export const read: RequestHandler = async (req, res, next) => {
  try {
    const notification = await markRead(sessionUser(req), parseNotificationId(req.params.id));
    res.status(200).json(success({ notification }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/notifications/read-all */
export const readAll: RequestHandler = async (req, res, next) => {
  try {
    await markAllRead(sessionUser(req));
    res.status(200).json(success({ count: 0 }));
  } catch (error) {
    next(error);
  }
};
