import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { verifyGoogleIdToken } from './googleIdentity.service.js';

export interface SignInResult {
  user: User;
  isNewUser: boolean;
}

/**
 * What the person chose on Welcome (docs/features/sign-in-sign-up.md §4).
 * Absent means a client from before the split: find or create, as before.
 */
export type SignInIntent = 'signin' | 'signup';

export const NO_ACCOUNT = 'No account for this Google account yet.';

/**
 * Verify the Google token, then find the account by `google_sub` — and, for
 * `signup` (or no intent), create it when there is none. `signin` never
 * creates: without an account it is a 404 with nothing written. `signup` for
 * an existing account simply signs in (CLAUDE.md §5, sign-in-sign-up.md §0).
 *
 * The Google photo is kept only while it can still be chosen (before
 * onboarding) or after the user chose it — then it is refreshed, because Google
 * picture URLs change. A user who declined it never has it stored again
 * (docs/features/onboarding.md §3).
 */
export async function authenticateWithGoogle(
  credential: string,
  intent?: SignInIntent,
): Promise<SignInResult> {
  const { sub, picture } = await verifyGoogleIdToken(credential);

  const existing = await prisma.user.findUnique({ where: { googleSub: sub } });
  if (existing) {
    const keep = needsOnboarding(existing) || existing.useGooglePicture;
    return { user: await syncPicture(existing, keep ? picture : null), isNewUser: false };
  }
  if (intent === 'signin') {
    throw new AppError(NO_ACCOUNT, 404);
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
