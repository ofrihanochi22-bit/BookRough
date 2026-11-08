import { NotificationType, Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import {
  notificationInclude,
  type PublicNotification,
  toPublicNotification,
} from '../utils/publicNotification.js';
import { decodeCursor, encodeCursor, PAGE_SIZE } from '../utils/cursor.js';
import { requireOnboarded } from './profile.service.js';

const log = createLogger('notification.service');

export const NOTIFICATION_NOT_FOUND = 'Notification not found.';

/**
 * Every writer runs after its event has committed, and never throws: a
 * notification problem must not fail or undo the post, rating, request or
 * invitation that caused it (docs/features/notifications.md §4.5). Ids only in
 * the logs.
 */
async function writeSafely(event: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    log.warn({ err: error, event }, 'Notification write failed');
  }
}

/**
 * A community post: every other member's unread group for that community grows
 * by one, or a new group starts (D6). One statement for every member; Prisma
 * cannot target the partial unique index `notifications_one_open_group`, so
 * this is raw SQL (CLAUDE.md §4).
 */
export function notifyCommunityPost(input: { communityId: string; authorId: string }) {
  const { communityId, authorId } = input;
  return writeSafely('communityPost', () =>
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO notifications (user_id, type, actor_id, community_id)
      SELECT m.user_id, 'COMMUNITY_POSTS'::"NotificationType", ${authorId}::uuid, ${communityId}::uuid
      FROM community_members m
      WHERE m.community_id = ${communityId}::uuid AND m.user_id <> ${authorId}::uuid
      ON CONFLICT (user_id, community_id)
        WHERE type = 'COMMUNITY_POSTS' AND read_at IS NULL
      DO UPDATE SET
        count = notifications.count + 1,
        actor_id = EXCLUDED.actor_id,
        updated_at = now()`),
  );
}

/** A direct recommendation received (UC-20). */
export function notifyRecommendation(input: {
  senderId: string;
  recipientId: string;
  postId: string;
}) {
  return writeSafely('recommendation', () =>
    prisma.notification.create({
      data: {
        userId: input.recipientId,
        type: NotificationType.RECOMMENDATION,
        actorId: input.senderId,
        postId: input.postId,
      },
    }),
  );
}

/** The first rating of a post; never an edit (D7). Nobody is told about their own rating. */
export async function notifyRating(input: { authorId: string; raterId: string; postId: string }) {
  if (input.authorId === input.raterId) {
    return;
  }
  await writeSafely('rating', () =>
    prisma.notification.create({
      data: {
        userId: input.authorId,
        type: NotificationType.RATING,
        actorId: input.raterId,
        postId: input.postId,
      },
    }),
  );
}

/**
 * Someone sent the addressee a friend request (UC-6). At most one unread row
 * per sender: sending, cancelling and sending again refreshes that row rather
 * than stacking new ones on the badge.
 */
export function notifyFriendRequest(input: { requesterId: string; addresseeId: string }) {
  return writeSafely('friendRequest', async () => {
    const where = {
      userId: input.addresseeId,
      type: NotificationType.FRIEND_REQUEST,
      actorId: input.requesterId,
      readAt: null,
    };
    const { count } = await prisma.notification.updateMany({
      where,
      data: { updatedAt: new Date() },
    });
    if (count === 0) {
      await prisma.notification.create({
        data: { userId: where.userId, type: where.type, actorId: where.actorId },
      });
    }
  });
}

/** The addressee accepted the requester's request (UC-7). */
export function notifyFriendAccepted(input: { requesterId: string; addresseeId: string }) {
  return writeSafely('friendAccepted', () =>
    prisma.notification.create({
      data: {
        userId: input.requesterId,
        type: NotificationType.FRIEND_ACCEPTED,
        actorId: input.addresseeId,
      },
    }),
  );
}

/** An admin invited friends to a community (UC-9's picker): one row per invitation actually created. */
export function notifyInvitations(input: {
  communityId: string;
  invitedById: string;
  userIds: string[];
}) {
  return writeSafely('invitation', () =>
    prisma.notification.createMany({
      data: input.userIds.map((userId) => ({
        userId,
        type: NotificationType.COMMUNITY_INVITATION,
        actorId: input.invitedById,
        communityId: input.communityId,
      })),
    }),
  );
}

/**
 * What a reader may still see (§4): a community's posts only while a member,
 * an invitation unless banned, a post only while Post Detail would open it.
 * Filtered on every read, so leaving hides rows and rejoining shows them again.
 */
function visibleTo(userId: string): Prisma.NotificationWhereInput {
  return {
    userId,
    OR: [
      { type: { in: [NotificationType.FRIEND_REQUEST, NotificationType.FRIEND_ACCEPTED] } },
      { type: NotificationType.COMMUNITY_POSTS, community: { members: { some: { userId } } } },
      { type: NotificationType.COMMUNITY_INVITATION, community: { bans: { none: { userId } } } },
      {
        type: { in: [NotificationType.RECOMMENDATION, NotificationType.RATING] },
        post: {
          OR: [
            { communityId: null, OR: [{ authorId: userId }, { recipientId: userId }] },
            { community: { members: { some: { userId } } } },
          ],
        },
      },
    ],
  };
}

/** The rater's current score on each RATING row's post; absent if the rating is gone. */
async function currentScores(
  rows: { type: NotificationType; actorId: string; postId: string | null }[],
): Promise<Map<string, number>> {
  const pairs = rows.flatMap((row) =>
    row.type === NotificationType.RATING && row.postId
      ? [{ postId: row.postId, userId: row.actorId }]
      : [],
  );
  if (pairs.length === 0) {
    return new Map();
  }
  const ratings = await prisma.rating.findMany({
    where: { OR: pairs },
    select: { postId: true, userId: true, score: true },
  });
  return new Map(ratings.map((rating) => [scoreKey(rating.postId, rating.userId), rating.score]));
}

function scoreKey(postId: string, userId: string): string {
  return `${postId}:${userId}`;
}

async function toPublicPage(
  rows: Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>[],
): Promise<PublicNotification[]> {
  const scores = await currentScores(rows);
  return rows.map((row) =>
    toPublicNotification(
      row,
      row.postId === null ? null : (scores.get(scoreKey(row.postId, row.actorId)) ?? null),
    ),
  );
}

interface NotificationPage {
  items: PublicNotification[];
  nextCursor: string | null;
}

/** GET /notifications — newest activity first, keyset-paginated like the feed. */
export async function listNotifications(user: User, before?: string): Promise<NotificationPage> {
  requireOnboarded(user);
  const cursor = before === undefined ? null : decodeCursor(before);

  const rows = await prisma.notification.findMany({
    where: {
      AND: [
        visibleTo(user.id),
        ...(cursor
          ? [
              {
                OR: [
                  { updatedAt: { lt: cursor.createdAt } },
                  { updatedAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: notificationInclude,
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: await toPublicPage(page),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ createdAt: last.updatedAt, id: last.id })
        : null,
  };
}

/** GET /notifications/unread-count — the Home tab's badge; a group counts once. */
export async function countUnread(user: User): Promise<number> {
  requireOnboarded(user);
  return prisma.notification.count({ where: { AND: [visibleTo(user.id), { readAt: null }] } });
}

/**
 * POST /notifications/:id/read — idempotent. Someone else's row is the same 404
 * as a missing one, so an id reveals nothing.
 */
export async function markRead(user: User, notificationId: string): Promise<PublicNotification> {
  requireOnboarded(user);
  // The same visibility as the list: a row the reader cannot see is not touched.
  await prisma.notification.updateMany({
    where: { AND: [visibleTo(user.id), { id: notificationId, readAt: null }] },
    data: { readAt: new Date() },
  });
  const row = await prisma.notification.findFirst({
    where: { AND: [visibleTo(user.id), { id: notificationId }] },
    include: notificationInclude,
  });
  if (!row) {
    throw new AppError(NOTIFICATION_NOT_FOUND, 404);
  }
  const [item] = await toPublicPage([row]);
  return item!;
}

/** POST /notifications/read-all — every unread row of the reader. Idempotent. */
export async function markAllRead(user: User): Promise<void> {
  requireOnboarded(user);
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  log.debug({ userId: user.id, count }, 'Notifications marked read');
}
