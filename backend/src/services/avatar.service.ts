import type { User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { toAdminUser, type AdminUser, adminUserSelect } from '../utils/adminViews.js';
import { AppError } from '../utils/AppError.js';
import { isUploadedAvatarUrl, uploadedAvatarUrl } from '../utils/avatarUrl.js';
import { createLogger } from '../utils/logger.js';
import { requireOnboarded } from './profile.service.js';
import { processSquareImage, SQUARE_IMAGE_MESSAGES } from './squareImage.js';

const log = createLogger('avatar.service');

export const AVATAR_MESSAGES = {
  ...SQUARE_IMAGE_MESSAGES,
  notFound: 'No photo.',
  userNotFound: 'User not found.',
} as const;

/** PUT /users/me/avatar — replaces the caller's photo with the re-encoded upload. */
export async function uploadAvatar(user: User, bytes: Buffer): Promise<User> {
  requireOnboarded(user);
  // A plain Uint8Array copy: Prisma's Bytes takes no Node Buffer subtype.
  const image = new Uint8Array(await processSquareImage(bytes));
  const updated = await prisma.$transaction(async (tx) => {
    const avatar = await tx.userAvatar.upsert({
      where: { userId: user.id },
      create: { userId: user.id, image },
      update: { image },
      select: { updatedAt: true },
    });
    return tx.user.update({
      where: { id: user.id },
      data: {
        profilePictureUrl: uploadedAvatarUrl(user.id, avatar.updatedAt),
        useGooglePicture: false,
      },
    });
  });
  log.info({ userId: user.id, bytes: image.length }, 'Avatar uploaded');
  return updated;
}

/** DELETE /users/me/avatar — back to the generated avatar. Idempotent. */
export async function removeOwnAvatar(user: User): Promise<User> {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.userAvatar.deleteMany({ where: { userId: user.id } });
    if (!isUploadedAvatarUrl(user.profilePictureUrl)) {
      return user;
    }
    return tx.user.update({ where: { id: user.id }, data: { profilePictureUrl: null } });
  });
  return updated;
}

/** The stored photo for GET /users/:id/avatar, or null. */
export async function findAvatar(userId: string): Promise<Buffer | null> {
  const avatar = await prisma.userAvatar.findUnique({
    where: { userId },
    select: { image: true },
  });
  return avatar ? Buffer.from(avatar.image) : null;
}

/**
 * DELETE /admin/users/:id/avatar — the site admin removes a user's photo,
 * uploaded or Google (D2). Recorded as a log line (avatar-upload.md §4).
 */
export async function adminRemovePhoto(admin: User, userId: string): Promise<AdminUser> {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) {
    throw new AppError(AVATAR_MESSAGES.userNotFound, 404);
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.userAvatar.deleteMany({ where: { userId } });
    return tx.user.update({
      where: { id: userId },
      data: { profilePictureUrl: null, useGooglePicture: false },
      select: adminUserSelect,
    });
  });
  log.info({ adminId: admin.id, userId }, "Admin removed a user's photo");
  return toAdminUser(row);
}
