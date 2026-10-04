import type { RequestHandler } from 'express';

import { sessionUser } from '../middleware/requireAuth.js';
import { listCommunities, listUsers } from '../services/admin.service.js';
import { createLogger } from '../utils/logger.js';
import { success } from '../utils/response.js';

const log = createLogger('admin');

/** GET /api/admin/users — behind requireAuth + requireAppAdmin. */
export const users: RequestHandler = async (req, res, next) => {
  try {
    const list = await listUsers();
    log.info({ userId: sessionUser(req).id, count: list.length }, 'Admin listed users');
    res.status(200).json(success({ users: list }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/admin/communities — behind requireAuth + requireAppAdmin. */
export const communities: RequestHandler = async (req, res, next) => {
  try {
    const list = await listCommunities();
    log.info({ userId: sessionUser(req).id, count: list.length }, 'Admin listed communities');
    res.status(200).json(success({ communities: list }));
  } catch (error) {
    next(error);
  }
};
