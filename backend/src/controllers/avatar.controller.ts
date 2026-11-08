import express, { type RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  adminRemovePhoto,
  AVATAR_LIMITS,
  AVATAR_MESSAGES,
  findAvatar,
  removeOwnAvatar,
  uploadAvatar,
} from '../services/avatar.service.js';
import { AppError } from '../utils/AppError.js';
import { sessionPayload } from '../utils/publicUser.js';
import { success } from '../utils/response.js';

/** docs/features/avatar-upload.md §4. */
const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/**
 * The raw image body, on the upload route only. Its cap is a little above the
 * real 2 MB limit, so the service — not the parser — says "too large" in our words.
 */
export const avatarBody = express.raw({
  type: IMAGE_TYPES,
  limit: AVATAR_LIMITS.maxUploadBytes + 64 * 1024,
});

const userIdSchema = z.string().uuid();

/** A malformed id is the same 404 as a user with no photo. */
function parseUserId(raw: unknown, message: string): string {
  const id = userIdSchema.safeParse(raw);
  if (!id.success) {
    throw new AppError(message, 404);
  }
  return id.data;
}

/** PUT /api/users/me/avatar — the raw bytes of a JPEG, PNG or WebP. */
export const putAvatar: RequestHandler = async (req, res, next) => {
  try {
    // express.raw leaves anything that isn't one of the three types unparsed.
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(AVATAR_MESSAGES.unsupported, 415);
    }
    const user = await uploadAvatar(sessionUser(req), req.body);
    res.status(200).json(success(sessionPayload(user)));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/users/me/avatar — back to the generated avatar. */
export const deleteAvatar: RequestHandler = async (req, res, next) => {
  try {
    const user = await removeOwnAvatar(sessionUser(req));
    res.status(200).json(success(sessionPayload(user)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/:userId/avatar — any signed-in user; the URL is versioned, so cached for good. */
export const getAvatar: RequestHandler = async (req, res, next) => {
  try {
    const image = await findAvatar(parseUserId(req.params.userId, AVATAR_MESSAGES.notFound));
    if (!image) {
      throw new AppError(AVATAR_MESSAGES.notFound, 404);
    }
    res
      .status(200)
      .type('image/webp')
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(image);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/admin/users/:userId/avatar — the site admin removes a photo (D2). */
export const adminDeleteAvatar: RequestHandler = async (req, res, next) => {
  try {
    const userId = parseUserId(req.params.userId, AVATAR_MESSAGES.userNotFound);
    const user = await adminRemovePhoto(sessionUser(req), userId);
    res.status(200).json(success({ user }));
  } catch (error) {
    next(error);
  }
};
