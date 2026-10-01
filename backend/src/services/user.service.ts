import { Prisma, type StreamingService, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { DISPLAY_NAME_MESSAGES, checkDisplayName, isReservedKey } from './displayName.js';

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

  try {
    return await prisma.user.update({ where: { id: user.id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(DISPLAY_NAME_MESSAGES.taken, 409);
    }
    throw error;
  }
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
