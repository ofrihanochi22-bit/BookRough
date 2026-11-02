import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { postInclude } from '../utils/publicPost.js';
import { NO_RATINGS } from '../utils/ratingSummary.js';
import { type SavedPost, toSavedPost } from '../utils/savedPost.js';
import { isAdminRole } from './communityAccess.js';
import { friendsOnPosts } from './friendship.js';
import { decodeCursor, encodeCursor, PAGE_SIZE, POST_NOT_FOUND } from './post.service.js';
import { requirePostAccess } from './postAccess.js';
import { ratingSummaries, summaryFor } from './ratingSummary.js';

const log = createLogger('bookmark.service');

export const OWN_POST = "You can't save your own post.";
export const ALREADY_RATED = 'You already rated this post.';

/**
 * PUT /posts/:postId/bookmark — UC-12. A member saves someone else's post.
 * Idempotent: saving twice is one bookmark. A post the caller cannot reach is a
 * 404, like a missing one (docs/features/bookmarks-my-list.md §4); saving a
 * direct item stays allowed after unfriending, because it reaches nobody.
 */
export async function saveBookmark(user: User, postId: string): Promise<void> {
  const post = await requirePostAccess(user, postId);
  if (post.authorId === user.id) {
    throw new AppError(OWN_POST, 403);
  }
  // Nothing would be left to do with it on My List (rate-post.md §4).
  const rated = await prisma.rating.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
    select: { id: true },
  });
  if (rated) {
    throw new AppError(ALREADY_RATED, 409);
  }

  try {
    await prisma.bookmark.createMany({
      data: [{ userId: user.id, postId }],
      skipDuplicates: true,
    });
  } catch (error) {
    // The post was deleted between the check and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new AppError(POST_NOT_FOUND, 404);
    }
    throw error;
  }
  log.info({ userId: user.id, postId, action: 'save' }, 'Bookmark saved');
}

/**
 * DELETE /posts/:postId/bookmark — removes the caller's own row, if any. No
 * membership check: a bookmark outlives leaving (§3.2), and the caller learns
 * nothing about a post they never saved.
 */
export async function removeBookmark(user: User, postId: string): Promise<void> {
  await prisma.bookmark.deleteMany({ where: { userId: user.id, postId } });
  log.info({ userId: user.id, postId, action: 'remove' }, 'Bookmark removed');
}

/** GET /users/me/bookmarks — My List, newest saved first, keyset-paginated. */
export async function listBookmarks(
  user: User,
  before?: string,
): Promise<{ items: SavedPost[]; nextCursor: string | null }> {
  const cursor = before === undefined ? null : decodeCursor(before);

  const rows = await prisma.bookmark.findMany({
    where: {
      userId: user.id,
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, postId: { lt: cursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
    take: PAGE_SIZE + 1,
    select: {
      createdAt: true,
      postId: true,
      post: {
        include: {
          ...postInclude(user.id),
          community: {
            select: {
              id: true,
              name: true,
              members: { where: { userId: user.id }, select: { role: true } },
            },
          },
        },
      },
    },
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  // Ratings are for current members only (post-detail.md §6): a song saved from
  // a community you left keeps no live view of them. A direct item's two people
  // may always see its rating.
  const seesRatings = ({ post }: (typeof page)[number]) =>
    post.community === null || post.community.members.length > 0;
  const [summaries, friends] = await Promise.all([
    ratingSummaries(page.filter(seesRatings).map((row) => row.postId)),
    friendsOnPosts(
      user.id,
      page.map((row) => row.post),
    ),
  ]);
  return {
    items: page.map((row) => {
      const role = row.post.community?.members[0]?.role;
      return toSavedPost(
        row,
        user.id,
        role !== undefined && isAdminRole(role),
        seesRatings(row) ? summaryFor(summaries, row.postId) : NO_RATINGS,
        friends,
      );
    }),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.postId })
        : null,
  };
}
