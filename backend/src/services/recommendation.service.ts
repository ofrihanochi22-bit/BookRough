import { type Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { postInclude, type PublicPost, toPublicPost } from '../utils/publicPost.js';
import { NO_RATINGS } from '../utils/ratingSummary.js';
import { POST_NOT_FOUND } from './communityAccess.js';
import { areFriends, friendsOnPosts, lockFriendship } from './friendship.js';
import {
  beforeCursor,
  decodeCursor,
  encodeCursor,
  type NewPost,
  PAGE_SIZE,
  prepareSharedLink,
} from './post.service.js';
import { requirePostAccess } from './postAccess.js';
import { notifyRecommendation } from './notification.service.js';
import { findProfileUser, requireOnboarded } from './profile.service.js';
import { ratingSummaries, summaryFor } from './ratingSummary.js';

const log = createLogger('recommendation.service');

export const FRIENDS_ONLY = 'You can only send songs to friends.';
export const SELF_SEND = "You can't send a song to yourself.";
export const RECIPIENT_ONLY = 'Only the recipient can hide this.';

export interface NewRecommendation extends NewPost {
  recipientId: string;
}

/**
 * POST /recommendations — UC-20. Synchronous, like posting: it returns once the
 * item is saved, converted or not (CLAUDE.md §7). The conversion takes seconds,
 * so friendship is checked before it, to spare a browser, and again with the
 * insert, where it counts (docs/features/direct-recommendations.md §4).
 */
export async function sendRecommendation(
  user: User,
  input: NewRecommendation,
): Promise<PublicPost> {
  requireOnboarded(user);
  const { recipientId } = input;
  if (recipientId === user.id) {
    throw new AppError(SELF_SEND, 422);
  }
  await findProfileUser(recipientId);
  if (!(await areFriends(user.id, recipientId))) {
    throw new AppError(FRIENDS_ONLY, 403);
  }

  const shared = await prepareSharedLink(input);

  const post = await prisma.$transaction(async (tx) => {
    if (!(await lockFriendship(tx, user.id, recipientId))) {
      throw new AppError(FRIENDS_ONLY, 403);
    }
    return tx.post.create({
      data: { authorId: user.id, recipientId, ...shared },
      include: postInclude(user.id),
    });
  });

  log.info(
    {
      userId: user.id,
      recipientId,
      postId: post.id,
      conversionPending: post.conversionPending,
      linkPlatform: post.linkPlatform,
    },
    'Recommendation sent',
  );
  // The item is saved: a notification problem never undoes or fails it (notifications.md §4.5).
  await notifyRecommendation({ senderId: user.id, recipientId, postId: post.id });
  return toPublicPost(post, user.id, false, NO_RATINGS, new Set([recipientId]));
}

interface RecommendationPage {
  posts: PublicPost[];
  nextCursor: string | null;
}

/** Newest first, keyset-paginated: the feed's page size and cursor. */
async function listRecommendations(
  user: User,
  where: Prisma.PostWhereInput,
  before?: string,
): Promise<RecommendationPage> {
  requireOnboarded(user);
  const cursor = before === undefined ? null : decodeCursor(before);

  const rows = await prisma.post.findMany({
    where: {
      ...where,
      ...(cursor && beforeCursor(cursor)),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: postInclude(user.id),
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const [summaries, friends] = await Promise.all([
    ratingSummaries(page.map((post) => post.id)),
    friendsOnPosts(user.id, page),
  ]);
  return {
    posts: page.map((post) =>
      toPublicPost(post, user.id, false, summaryFor(summaries, post.id), friends),
    ),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/** GET /recommendations/received — sent to the caller, minus what they hid (§3.5). */
export function listReceived(user: User, before?: string): Promise<RecommendationPage> {
  return listRecommendations(user, { recipientId: user.id, recipientHiddenAt: null }, before);
}

/** GET /recommendations/sent — a recipient's hide changes nothing here. */
export function listSent(user: User, before?: string): Promise<RecommendationPage> {
  return listRecommendations(user, { authorId: user.id, recipientId: { not: null } }, before);
}

/** GET /recommendations/unseen-count — the badge's share of the Friends tab. */
export async function countUnseen(user: User): Promise<number> {
  requireOnboarded(user);
  const seenAt = user.recommendationsSeenAt;
  return prisma.post.count({
    where: {
      recipientId: user.id,
      recipientHiddenAt: null,
      ...(seenAt && { createdAt: { gt: seenAt } }),
    },
  });
}

/** POST /recommendations/seen — opening Received clears the count. Idempotent. */
export async function markSeen(user: User): Promise<void> {
  requireOnboarded(user);
  await prisma.user.update({
    where: { id: user.id },
    data: { recommendationsSeenAt: new Date() },
  });
}

/**
 * PUT /recommendations/:postId/hidden — the recipient removes an item from
 * Received, nothing else: the bookmark and rating stay, and the sender is not
 * told (§3.5). Idempotent, and allowed after unfriending.
 */
export async function hideRecommendation(user: User, postId: string): Promise<void> {
  requireOnboarded(user);
  const access = await requirePostAccess(user, postId);
  if (access.scope === 'COMMUNITY') {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  if (!access.isRecipient) {
    throw new AppError(RECIPIENT_ONLY, 403);
  }
  await prisma.post.updateMany({
    where: { id: postId, recipientHiddenAt: null },
    data: { recipientHiddenAt: new Date() },
  });
  log.info({ userId: user.id, postId }, 'Recommendation hidden');
}
