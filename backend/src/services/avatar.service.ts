import type { User } from '@prisma/client';
import sharp from 'sharp';

import { prisma } from '../db/prisma.js';
import { toAdminUser, type AdminUser, adminUserSelect } from '../utils/adminViews.js';
import { AppError } from '../utils/AppError.js';
import { isUploadedAvatarUrl, uploadedAvatarUrl } from '../utils/avatarUrl.js';
import { createLogger } from '../utils/logger.js';
import { requireOnboarded } from './profile.service.js';

const log = createLogger('avatar.service');

/** docs/features/avatar-upload.md §4. */
export const AVATAR_LIMITS = {
  /** The raw upload, before anything else is read. */
  maxUploadBytes: 2 * 1024 * 1024,
  /** A decompression bomb is refused before it is decoded. */
  maxInputPixels: 25_000_000,
  size: 256,
  maxOutputBytes: 100 * 1024,
} as const;

export const AVATAR_MESSAGES = {
  unsupported: "That file isn't a supported image. Use a JPEG, PNG or WebP.",
  tooLarge: 'That image is too large. Choose one under 2 MB.',
  notFound: 'No photo.',
  userNotFound: 'User not found.',
} as const;

/** JPEG, PNG or WebP by their first bytes — never by a header or a file name. */
function hasImageSignature(bytes: Buffer): boolean {
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length > 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/**
 * The server's own re-encode (D1): orientation applied, centre-cropped to a
 * square, 256×256 WebP, no metadata. Whatever was uploaded, only these bytes
 * are ever stored, so a crafted file and its EXIF (location) never survive.
 */
export async function processAvatar(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > AVATAR_LIMITS.maxUploadBytes) {
    throw new AppError(AVATAR_MESSAGES.tooLarge, 413);
  }
  if (!hasImageSignature(bytes)) {
    throw new AppError(AVATAR_MESSAGES.unsupported, 422);
  }
  for (const quality of [80, 60, 40]) {
    let output: Buffer;
    try {
      output = await sharp(bytes, {
        limitInputPixels: AVATAR_LIMITS.maxInputPixels,
        failOn: 'error',
        animated: false,
      })
        .rotate()
        .resize(AVATAR_LIMITS.size, AVATAR_LIMITS.size, { fit: 'cover', position: 'centre' })
        .webp({ quality })
        .toBuffer();
    } catch {
      // Truncated, corrupt, or too many pixels: all the same to the user.
      throw new AppError(AVATAR_MESSAGES.unsupported, 422);
    }
    if (output.length <= AVATAR_LIMITS.maxOutputBytes) {
      return output;
    }
  }
  throw new AppError(AVATAR_MESSAGES.unsupported, 422);
}

/** PUT /users/me/avatar — replaces the caller's photo with the re-encoded upload. */
export async function uploadAvatar(user: User, bytes: Buffer): Promise<User> {
  requireOnboarded(user);
  // A plain Uint8Array copy: Prisma's Bytes takes no Node Buffer subtype.
  const image = new Uint8Array(await processAvatar(bytes));
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
