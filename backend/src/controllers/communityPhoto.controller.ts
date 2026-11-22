import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import {
  adminRemoveCommunityPhoto,
  COMMUNITY_PHOTO_MESSAGES,
  findCommunityPhoto,
  removeCommunityPhoto,
  uploadCommunityPhoto,
} from '../services/communityPhoto.service.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/response.js';
import { parseCommunityId } from './community.controller.js';

/** docs/features/community-photo.md §4. */

/** PUT /api/communities/:id/photo — the raw bytes of a JPEG, PNG or WebP (imageBody). */
export const putPhoto: RequestHandler = async (req, res, next) => {
  try {
    const communityId = parseCommunityId(req.params.id);
    // express.raw leaves anything that isn't one of the three types unparsed.
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(COMMUNITY_PHOTO_MESSAGES.unsupported, 415);
    }
    const community = await uploadCommunityPhoto(sessionUser(req), communityId, req.body);
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/communities/:id/photo — back to the generated cover. */
export const deletePhoto: RequestHandler = async (req, res, next) => {
  try {
    const community = await removeCommunityPhoto(sessionUser(req), parseCommunityId(req.params.id));
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};

const idSchema = z.string().uuid();

/** GET /api/communities/:id/photo — any signed-in user (D3); the URL is versioned, so cached for good. */
export const getPhoto: RequestHandler = async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const image = id.success ? await findCommunityPhoto(id.data) : null;
    if (!image) {
      throw new AppError(COMMUNITY_PHOTO_MESSAGES.notFound, 404);
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

/** DELETE /api/admin/communities/:communityId/photo — the site admin removes a photo (D2). */
export const adminDeletePhoto: RequestHandler = async (req, res, next) => {
  try {
    const community = await adminRemoveCommunityPhoto(
      sessionUser(req),
      parseCommunityId(req.params.communityId),
    );
    res.status(200).json(success({ community }));
  } catch (error) {
    next(error);
  }
};
