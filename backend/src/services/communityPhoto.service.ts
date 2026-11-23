import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import {
  adminCommunitySelect,
  type AdminCommunity,
  toAdminCommunity,
} from '../utils/adminViews.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import type { PublicCommunity } from '../utils/publicCommunity.js';
import { COMMUNITY_NOT_FOUND, requireAdmin } from './communityAccess.js';
import { getCommunity } from './community.service.js';
import { processSquareImage, SQUARE_IMAGE_MESSAGES } from './squareImage.js';

const log = createLogger('communityPhoto.service');

/** docs/features/community-photo.md §4. */
export const COMMUNITY_PHOTO_MESSAGES = {
  ...SQUARE_IMAGE_MESSAGES,
  adminsOnly: 'Only admins can change the photo.',
  notFound: 'No photo.',
  communityNotFound: COMMUNITY_NOT_FOUND,
} as const;

/** The community went away mid-request (deleted by its owner or the site admin). */
function isGone(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2003' || error.code === 'P2025')
  );
}

/**
 * PUT /communities/:id/photo — an admin or the owner (D1). The bytes are
 * re-encoded before anything is written; the row and `photo_updated_at` are
 * written together, the timestamp taken from the row, so the URL's `?v=`
 * always matches the stored image (§3).
 */
export async function uploadCommunityPhoto(
  user: User,
  communityId: string,
  bytes: Buffer,
): Promise<PublicCommunity> {
  await requireAdmin(user, communityId, COMMUNITY_PHOTO_MESSAGES.adminsOnly);
  // A plain Uint8Array copy: Prisma's Bytes takes no Node Buffer subtype.
  const image = new Uint8Array(await processSquareImage(bytes));
  try {
    await prisma.$transaction(async (tx) => {
      const photo = await tx.communityPhoto.upsert({
        where: { communityId },
        create: { communityId, image },
        update: { image },
        select: { updatedAt: true },
      });
      await tx.community.update({
        where: { id: communityId },
        data: { photoUpdatedAt: photo.updatedAt },
      });
    });
  } catch (error) {
    if (isGone(error)) {
      throw new AppError(COMMUNITY_NOT_FOUND, 404);
    }
    throw error;
  }
  log.info({ userId: user.id, communityId, bytes: image.length }, 'Community photo uploaded');
  return getCommunity(user, communityId);
}

/** Deletes the photo and clears the timestamp, in one transaction. True when there was one. */
async function clearPhoto(communityId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.communityPhoto.deleteMany({ where: { communityId } });
    await tx.community.updateMany({ where: { id: communityId }, data: { photoUpdatedAt: null } });
    return count > 0;
  });
}

/** DELETE /communities/:id/photo — back to the generated cover. Idempotent. */
export async function removeCommunityPhoto(
  user: User,
  communityId: string,
): Promise<PublicCommunity> {
  await requireAdmin(user, communityId, COMMUNITY_PHOTO_MESSAGES.adminsOnly);
  if (await clearPhoto(communityId)) {
    log.info({ userId: user.id, communityId }, 'Community photo removed');
  }
  return getCommunity(user, communityId);
}

/** The stored photo for GET /communities/:id/photo — any signed-in user (D3) — or null. */
export async function findCommunityPhoto(communityId: string): Promise<Buffer | null> {
  const photo = await prisma.communityPhoto.findUnique({
    where: { communityId },
    select: { image: true },
  });
  return photo ? Buffer.from(photo.image) : null;
}

/**
 * DELETE /admin/communities/:id/photo — the site admin removes a community's
 * photo (D2). Recorded as a log line, as the admin's Delete is.
 */
export async function adminRemoveCommunityPhoto(
  admin: User,
  communityId: string,
): Promise<AdminCommunity> {
  // With no such community this clears nothing, and the read below is the 404.
  const removed = await clearPhoto(communityId);
  const row = await prisma.community.findUnique({
    where: { id: communityId },
    select: adminCommunitySelect,
  });
  if (!row) {
    throw new AppError(COMMUNITY_NOT_FOUND, 404);
  }
  if (removed) {
    log.info({ adminId: admin.id, communityId }, "Admin removed a community's photo");
  }
  return toAdminCommunity(row);
}
