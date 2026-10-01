import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { verifyGoogleIdToken } from './googleIdentity.service.js';

export interface SignInResult {
  user: User;
  isNewUser: boolean;
}

/**
 * Sign-up and sign-in are one action (CLAUDE.md §5): verify the Google token,
 * then find the account by `google_sub` or create it.
 *
 * The Google photo is kept only while it can still be chosen (before
 * onboarding) or after the user chose it — then it is refreshed, because Google
 * picture URLs change. A user who declined it never has it stored again
 * (docs/features/onboarding.md §3).
 */
export async function authenticateWithGoogle(credential: string): Promise<SignInResult> {
  const { sub, picture } = await verifyGoogleIdToken(credential);

  const existing = await prisma.user.findUnique({ where: { googleSub: sub } });
  if (existing) {
    const keep = needsOnboarding(existing) || existing.useGooglePicture;
    return { user: await syncPicture(existing, keep ? picture : null), isNewUser: false };
  }

  try {
    const user = await prisma.user.create({
      data: { googleSub: sub, profilePictureUrl: picture },
    });
    return { user, isNewUser: true };
  } catch (error) {
    // Two first sign-ins racing (two tabs): the other one created the row
    // between our read and our insert. Both end up on the same account.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: sub } });
      return { user, isNewUser: false };
    }
    throw error;
  }
}

async function syncPicture(user: User, picture: string | null): Promise<User> {
  if (user.profilePictureUrl === picture) {
    return user;
  }
  return prisma.user.update({ where: { id: user.id }, data: { profilePictureUrl: picture } });
}

/** The session's user, or null when the row no longer exists. */
export function findSessionUser(userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } });
}
