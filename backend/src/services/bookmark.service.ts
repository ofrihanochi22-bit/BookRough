import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { postInclude } from '../utils/publicPost.js';
import { type SavedPost, toSavedPost } from '../utils/savedPost.js';
import { isAdminRole } from './communityAccess.js';
import { decodeCursor, encodeCursor, PAGE_SIZE, POST_NOT_FOUND } from './post.service.js';

const log = createLogger('bookmark.service');

export const OWN_POST = "You can't save your own post.";

/**
 * PUT /posts/:postId/bookmark — UC-12. A member saves someone else's post.
 * Idempotent: saving twice is one bookmark. A post in a community the caller
 * is not in is a 404, like the post itself (docs/features/bookmarks-my-list.md §4).
 */
export async function saveBookmark(user: User, postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, communityId: true },
  });
  if (!post) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId: post.communityId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  if (post.authorId === user.id) {
    throw new AppError(OWN_POST, 403);
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
  return {
    items: page.map((row) => {
      const role = row.post.community.members[0]?.role;
      return toSavedPost(row, user.id, role !== undefined && isAdminRole(role));
    }),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.postId })
        : null,
  };
}
