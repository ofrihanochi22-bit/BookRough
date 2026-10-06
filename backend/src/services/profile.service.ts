import type { Prisma, User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { type MemberUser, memberUserSelect, toMemberUser } from '../utils/communityMember.js';
import { needsOnboarding } from '../utils/publicUser.js';
import {
  type ProfileRating,
  profileRatingSelect,
  toProfileRating,
} from '../utils/profileRating.js';
import { type ProfileUser, profileUserSelect, toProfileUser } from '../utils/profileUser.js';
import { displayNameKey } from './displayName.js';
import { decodeCursor, encodeCursor, PAGE_SIZE } from './post.service.js';
import { cleanLine } from './textRules.js';

export const USER_NOT_FOUND = 'User not found.';
export const EMPTY_QUERY = 'Type a name to search.';
export const SEARCH_LIMIT = 20;

/** Everyone who has finished onboarding — the directory (find-people.md §4). */
const ONBOARDED = {
  displayName: { not: null },
  displayNameKey: { not: null },
  preferredService: { not: null },
} satisfies Prisma.UserWhereInput;

function requireOnboarded(user: User): void {
  if (needsOnboarding(user)) {
    throw new AppError('Finish your profile first.', 403);
  }
}

/** `LIKE` wildcards in a query are matched as themselves (find-people.md §6). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * GET /users/search?q= — UC-5. The whole directory, matched on the name key,
 * so case, spacing and accents do not matter. Names that start with the query
 * come first, then the rest; at most SEARCH_LIMIT.
 */
export async function searchUsers(
  user: User,
  rawQuery: string,
): Promise<{ users: MemberUser[]; hasMore: boolean }> {
  requireOnboarded(user);
  const key = displayNameKey(cleanLine(rawQuery));
  if (key === '') {
    throw new AppError(EMPTY_QUERY, 422);
  }
  const pattern = escapeLike(key);

  // One more than the limit tells whether there are more.
  const take = SEARCH_LIMIT + 1;
  const prefix = await prisma.user.findMany({
    where: { ...ONBOARDED, displayNameKey: { startsWith: pattern } },
    orderBy: { displayNameKey: 'asc' },
    take,
    select: memberUserSelect,
  });
  const rest =
    prefix.length < take
      ? await prisma.user.findMany({
          where: {
            ...ONBOARDED,
            AND: [
              { displayNameKey: { contains: pattern } },
              { NOT: { displayNameKey: { startsWith: pattern } } },
            ],
          },
          orderBy: { displayNameKey: 'asc' },
          take: take - prefix.length,
          select: memberUserSelect,
        })
      : [];

  const found = [...prefix, ...rest];
  return {
    users: found.slice(0, SEARCH_LIMIT).map(toMemberUser),
    hasMore: found.length > SEARCH_LIMIT,
  };
}

/** An onboarded user, or 404: someone mid-onboarding is not in the directory yet. */
async function findProfileUser(userId: string): Promise<ProfileUser> {
  const target = await prisma.user.findFirst({
    where: { id: userId, ...ONBOARDED },
    select: profileUserSelect,
  });
  if (!target?.displayName || !target.preferredService) {
    throw new AppError(USER_NOT_FOUND, 404);
  }
  return toProfileUser({
    ...target,
    displayName: target.displayName,
    preferredService: target.preferredService,
  });
}

/** GET /users/:userId — a Public Profile. */
export async function getProfile(user: User, userId: string): Promise<ProfileUser> {
  requireOnboarded(user);
  return findProfileUser(userId);
}

/**
 * GET /users/:userId/ratings — their ratings on posts in communities the
 * viewer is in now, newest first, keyset-paginated. Only what the viewer could
 * already see on Post Detail; a stranger gets an empty page, not an error.
 */
export async function listProfileRatings(
  user: User,
  userId: string,
  before?: string,
): Promise<{ items: ProfileRating[]; nextCursor: string | null }> {
  requireOnboarded(user);
  const cursor = before === undefined ? null : decodeCursor(before);
  await findProfileUser(userId);

  const rows = await prisma.rating.findMany({
    where: {
      userId,
      post: { community: { members: { some: { userId: user.id } } } },
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    select: profileRatingSelect,
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map(toProfileRating),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}
