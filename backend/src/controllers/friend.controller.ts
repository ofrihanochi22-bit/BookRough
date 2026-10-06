import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  acceptRequest,
  cancelRequest,
  countRequests,
  ignoreRequest,
  listFriends,
  listRequests,
  sendRequest,
  SENDER_GONE,
} from '../services/friend.service.js';
import { USER_NOT_FOUND } from '../services/profile.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';

const sendSchema = z.object({ userId: z.string().uuid() }).strict();
const userIdSchema = z.string().uuid();

/** A malformed user id in a path is "not found", like an unknown one (friend-requests.md §4). */
function parseUserId(raw: unknown, notFound = USER_NOT_FOUND): string {
  const id = userIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(notFound, 404);
  }
  return id.data;
}

/** POST /api/friends/requests — UC-6. */
export const send: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = parseBody(sendSchema, req.body);
    const friendship = await sendRequest(sessionUser(req), userId);
    res.status(200).json(success({ friendship }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/friends/requests/sent/:userId — withdraw your own request. */
export const cancel: RequestHandler = async (req, res, next) => {
  try {
    const friendship = await cancelRequest(sessionUser(req), parseUserId(req.params.userId));
    res.status(200).json(success({ friendship }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/friends/requests/:userId/accept — UC-7; `:userId` sent the request. */
export const accept: RequestHandler = async (req, res, next) => {
  try {
    const requesterId = parseUserId(req.params.userId, SENDER_GONE);
    const friend = await acceptRequest(sessionUser(req), requesterId);
    res.status(200).json(success({ friend }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/friends/requests/:userId/ignore — UC-7. */
export const ignore: RequestHandler = async (req, res, next) => {
  try {
    await ignoreRequest(sessionUser(req), parseUserId(req.params.userId));
    res.status(200).json(success(null));
  } catch (error) {
    next(error);
  }
};

/** GET /api/friends */
export const friends: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ friends: await listFriends(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/friends/requests */
export const requests: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ requests: await listRequests(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};

/** GET /api/friends/requests/count — the Friends tab's badge. */
export const requestCount: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(success({ count: await countRequests(sessionUser(req)) }));
  } catch (error) {
    next(error);
  }
};
