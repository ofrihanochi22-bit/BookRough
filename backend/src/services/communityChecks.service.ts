import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { type Cursor, decodeCursor, encodeCursor, PAGE_SIZE } from '../utils/cursor.js';
import { createLogger } from '../utils/logger.js';
import { postInclude, type PublicPost, toPublicPost } from '../utils/publicPost.js';
import { isAdminRole, POST_NOT_FOUND } from './communityAccess.js';
import { requirePostAccess } from './postAccess.js';
import { requireOnboarded } from './profile.service.js';
import { ratingSummaries, summaryFor } from './ratingSummary.js';

const log = createLogger('communityChecks.service');

/**
 * "From communities" — docs/features/community-unchecked.md (UC-20 amended):
 * other members' posts in the caller's communities, from the later of joining
 * and the clean start, that the caller has not checked.
 */

export interface UncheckedItem {
  post: PublicPost;
  community: { id: string; name: string };
}

export interface UncheckedPage {
  items: UncheckedItem[];
  nextCursor: string | null;
}

/**
 * The rule, as SQL: Prisma cannot compare `posts.created_at` with
 * `community_members.joined_at` (CLAUDE.md §4 allows raw SQL here). The post
 * side reads the feed index `(community_id, created_at desc, id desc)`.
 */
function uncheckedWhere(user: User): Prisma.Sql {
  return Prisma.sql`
    FROM posts p
    JOIN community_members m
      ON m.community_id = p.community_id AND m.user_id = ${user.id}::uuid
    JOIN users u ON u.id = m.user_id
    WHERE p.author_id <> m.user_id
      AND p.created_at >= GREATEST(m.joined_at, u.community_checks_since)
      AND NOT EXISTS (
        SELECT 1 FROM community_post_checks c
        WHERE c.user_id = m.user_id AND c.post_id = p.id
      )`;
}

function keyset(cursor: Cursor | null): Prisma.Sql {
  return cursor
    ? Prisma.sql`AND (p.created_at, p.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
    : Prisma.empty;
}

/** GET /recommendations/community — newest first, keyset-paginated like Received. */
export async function listUnchecked(user: User, before?: string): Promise<UncheckedPage> {
  requireOnboarded(user);
  const cursor = before === undefined ? null : decodeCursor(before);

  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id ${uncheckedWhere(user)} ${keyset(cursor)}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${PAGE_SIZE + 1}`;

  const pageIds = ids.slice(0, PAGE_SIZE).map((row) => row.id);
  const rows = await prisma.post.findMany({
    where: { id: { in: pageIds } },
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
  });
  // findMany does not keep the SQL's order; a post deleted meanwhile is skipped.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const page = pageIds.flatMap((id) => byId.get(id) ?? []);

  const summaries = await ratingSummaries(page.map((post) => post.id));
  const last = page.at(-1);
  return {
    items: page.flatMap((post) =>
      post.community
        ? [
            {
              // An admin or the owner may delete here too, as in the feed (posts-delete.md §4).
              post: toPublicPost(
                post,
                user.id,
                post.community.members.some((member) => isAdminRole(member.role)),
                summaryFor(summaries, post.id),
              ),
              community: { id: post.community.id, name: post.community.name },
            },
          ]
        : [],
    ),
    nextCursor: ids.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/** GET /recommendations/community/count — the pill's number. */
export async function countUnchecked(user: User): Promise<number> {
  requireOnboarded(user);
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count ${uncheckedWhere(user)}`;
  return Number(row?.count ?? 0);
}

/** A community post the caller may reach; a direct recommendation is the same 404 as a missing post. */
async function requireCommunityPost(user: User, postId: string) {
  requireOnboarded(user);
  const access = await requirePostAccess(user, postId);
  if (access.scope !== 'COMMUNITY') {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  return access;
}

/**
 * Writes the caller's check, if the post is someone else's community post.
 * Shared by the endpoint and by rating and saving (§4). Idempotent.
 */
export async function recordCheck(
  db: Prisma.TransactionClient,
  userId: string,
  post: { scope: 'COMMUNITY' | 'DIRECT'; authorId: string },
  postId: string,
): Promise<void> {
  if (post.scope !== 'COMMUNITY' || post.authorId === userId) {
    return;
  }
  await db.communityPostCheck.createMany({ data: [{ userId, postId }], skipDuplicates: true });
}

/**
 * PUT /recommendations/community/:postId/checked — opening a link, Post Detail
 * or Mark checked. The caller's own post is a no-op, so callers need not ask.
 */
export async function markChecked(user: User, postId: string): Promise<void> {
  const access = await requireCommunityPost(user, postId);
  try {
    await recordCheck(prisma, user.id, access, postId);
  } catch (error) {
    // The post was deleted between the check and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new AppError(POST_NOT_FOUND, 404);
    }
    throw error;
  }
  log.debug({ userId: user.id, postId }, 'Community post checked');
}

/** DELETE /recommendations/community/:postId/checked — Undo. Idempotent. */
export async function unmarkChecked(user: User, postId: string): Promise<void> {
  await requireCommunityPost(user, postId);
  await prisma.communityPostCheck.deleteMany({ where: { userId: user.id, postId } });
  log.debug({ userId: user.id, postId }, 'Community post check undone');
}
