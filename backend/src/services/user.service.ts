import { Prisma, type StreamingService, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { verifyGoogleIdToken } from './googleIdentity.service.js';
import { DISPLAY_NAME_MESSAGES, checkDisplayName, isReservedKey } from './displayName.js';

const log = createLogger('user.service');

export interface ProfileUpdate {
  displayName?: string | undefined;
  preferredService?: StreamingService | undefined;
  useGooglePicture?: boolean | undefined;
}

export type Availability =
  { available: true; reason: null } | { available: false; reason: 'taken' | 'reserved' };

/** Validates a raw name and returns its cleaned form and key, or throws 422. */
function validName(raw: string): { displayName: string; key: string } {
  const check = checkDisplayName(raw);
  if (!check.ok) {
    throw new AppError(check.message, 422);
  }
  if (isReservedKey(check.key)) {
    throw new AppError(DISPLAY_NAME_MESSAGES.reserved, 422);
  }
  return { displayName: check.displayName, key: check.key };
}

/**
 * PATCH /users/me — completes onboarding, and later serves the settings
 * screen. While onboarding, name and service are both required, and the avatar
 * defaults to the generated one: a Google photo is only kept when chosen.
 */
export async function updateProfile(user: User, update: ProfileUpdate): Promise<User> {
  const onboarding = needsOnboarding(user);

  if (onboarding && (update.displayName === undefined || update.preferredService === undefined)) {
    throw new AppError('Choose a display name and a streaming service.', 422);
  }

  const data: Prisma.UserUpdateInput = {};

  if (update.displayName !== undefined) {
    const { displayName, key } = validName(update.displayName);
    data.displayName = displayName;
    data.displayNameKey = key;
  }
  if (update.preferredService !== undefined) {
    data.preferredService = update.preferredService;
  }

  const useGooglePicture = update.useGooglePicture ?? (onboarding ? false : undefined);
  if (useGooglePicture === true) {
    if (!user.profilePictureUrl) {
      throw new AppError('There is no Google photo to use.', 422);
    }
    data.useGooglePicture = true;
  } else if (useGooglePicture === false) {
    data.useGooglePicture = false;
    data.profilePictureUrl = null;
  }

  let updated: User;
  try {
    updated = await prisma.user.update({ where: { id: user.id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(DISPLAY_NAME_MESSAGES.taken, 409);
    }
    throw error;
  }
  if (!onboarding && user.useGooglePicture && data.useGooglePicture === false) {
    log.info({ userId: user.id }, 'Switched to the generated avatar');
  }
  return updated;
}

/** The live check behind the name field. The caller's own name is available. */
export async function checkAvailability(user: User, raw: string): Promise<Availability> {
  const check = checkDisplayName(raw);
  if (!check.ok) {
    throw new AppError(check.message, 422);
  }
  if (isReservedKey(check.key)) {
    return { available: false, reason: 'reserved' };
  }

  const owner = await prisma.user.findUnique({
    where: { displayNameKey: check.key },
    select: { id: true },
  });
  if (owner && owner.id !== user.id) {
    return { available: false, reason: 'taken' };
  }
  return { available: true, reason: null };
}

export const GOOGLE_PHOTO_MESSAGES = {
  failed: "Google sign-in didn't complete. Please try again.",
  otherAccount: "That's a different Google account. Use the account you signed up with.",
  noPhoto: 'Your Google account has no photo.',
} as const;

/**
 * POST /users/me/google-picture — the only way back to the Google photo after
 * declining it (docs/features/profile-settings.md §4). It needs a fresh Google
 * credential, so the photo is stored only at the moment the user asks for it,
 * and only from the account they signed up with. Nothing but `picture` is kept.
 *
 * A token that fails verification is a 422 here, not the sign-in 401: the
 * caller's session is valid, and a 401 would make the client sign them out.
 */
export async function rechooseGooglePicture(user: User, credential: string): Promise<User> {
  if (needsOnboarding(user)) {
    throw new AppError('Finish your profile first.', 403);
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      throw new AppError(GOOGLE_PHOTO_MESSAGES.failed, 422);
    }
    throw error;
  }

  if (identity.sub !== user.googleSub) {
    throw new AppError(GOOGLE_PHOTO_MESSAGES.otherAccount, 403);
  }
  if (!identity.picture) {
    throw new AppError(GOOGLE_PHOTO_MESSAGES.noPhoto, 422);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { profilePictureUrl: identity.picture, useGooglePicture: true },
  });
  log.info({ userId: user.id }, 'Google photo re-chosen');
  return updated;
}
