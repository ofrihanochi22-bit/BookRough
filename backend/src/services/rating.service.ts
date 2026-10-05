import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import {
  type PublicPostRating,
  ratingInclude,
  toPublicPostRating,
} from '../utils/publicPostRating.js';
import { type PublicRating, toPublicRating } from '../utils/publicRating.js';
import { type RatingSummary, summarize } from '../utils/ratingSummary.js';
import { ALREADY_RATED } from './bookmark.service.js';
import { POST_NOT_FOUND, requirePostMember } from './communityAccess.js';
import { checkPostComment } from './postText.js';
import { notifyAuthorOfRating } from './ratingNotification.js';

const log = createLogger('rating.service');

export const OWN_POST_RATING = "You can't rate your own post.";
export const SCORE_RANGE = 'Choose a score from 1 to 10.';
export const NOT_RATED = "You haven't rated this post.";

export interface NewRating {
  /** Validated here, not by the controller's schema, so it gets its own message. */
  score?: unknown;
  comment?: string | null | undefined;
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 10;
}

/**
 * POST /posts/:postId/ratings — UC-13. A current member rates someone else's
 * post, once; their bookmark on it is removed in the same transaction. A post
 * in a community the caller is not in now is a 404, like the post itself
 * (docs/features/rate-post.md §4). No bookmark is required: My List is the
 * UI's only entry point, not a rule of the API.
 */
export async function ratePost(
  user: User,
  postId: string,
  input: NewRating,
): Promise<PublicRating> {
  const post = await requirePostMember(user, postId);
  if (post.authorId === user.id) {
    throw new AppError(OWN_POST_RATING, 403);
  }
  if (!isScore(input.score)) {
    throw new AppError(SCORE_RANGE, 422);
  }
  const comment = checkPostComment(input.comment);
  if (!comment.ok) {
    throw new AppError(comment.message, 422);
  }
  const score = input.score;

  let rating;
  try {
    rating = await prisma.$transaction(async (tx) => {
      const created = await tx.rating.create({
        data: { postId, userId: user.id, score, comment: comment.value },
      });
      await tx.bookmark.deleteMany({ where: { userId: user.id, postId } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new AppError(ALREADY_RATED, 409);
      }
      if (error.code === 'P2003') {
        // The post was deleted between the check and the insert.
        throw new AppError(POST_NOT_FOUND, 404);
      }
    }
    throw error;
  }

  log.info({ userId: user.id, postId, score }, 'Post rated');
  // The rating is saved: a notification problem must never undo or fail it.
  try {
    notifyAuthorOfRating({ authorId: post.authorId, raterId: user.id, postId, score });
  } catch (error) {
    log.warn({ err: error, postId }, 'Rating notification failed');
  }
  return toPublicRating(rating);
}

/**
 * GET /posts/:postId/ratings — UC-16. Every rating on the post, newest first,
 * visible to the community's current members (docs/features/post-detail.md §4).
 * The summary comes from the same rows, so the two always agree.
 */
export async function listPostRatings(
  user: User,
  postId: string,
): Promise<{ ratingSummary: RatingSummary; ratings: PublicPostRating[] }> {
  await requirePostMember(user, postId);
  const rows = await prisma.rating.findMany({
    where: { postId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: ratingInclude,
  });
  const sum = rows.reduce((total, row) => total + row.score, 0);
  return {
    ratingSummary: summarize(sum, rows.length),
    ratings: rows.map((row) => toPublicPostRating(row, user.id)),
  };
}

export interface RatingChanges {
  score?: unknown;
  comment?: string | null | undefined;
}

/**
 * PATCH /posts/:postId/rating — a current member edits their own rating
 * (docs/features/post-detail.md §4). Only the keys sent change; no
 * notification (an edit is a correction).
 */
export async function editRating(
  user: User,
  postId: string,
  changes: RatingChanges,
): Promise<PublicPostRating> {
  await requirePostMember(user, postId);
  const existing = await prisma.rating.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(NOT_RATED, 404);
  }

  const data: { score?: number; comment?: string | null } = {};
  if ('score' in changes) {
    if (!isScore(changes.score)) {
      throw new AppError(SCORE_RANGE, 422);
    }
    data.score = changes.score;
  }
  if ('comment' in changes) {
    const comment = checkPostComment(changes.comment);
    if (!comment.ok) {
      throw new AppError(comment.message, 422);
    }
    data.comment = comment.value;
  }

  try {
    const updated = await prisma.rating.update({
      where: { id: existing.id },
      data,
      include: ratingInclude,
    });
    log.info({ userId: user.id, postId, score: updated.score }, 'Rating edited');
    return toPublicPostRating(updated, user.id);
  } catch (error) {
    // Deleted (with its post, or by a removal) between the read and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new AppError(POST_NOT_FOUND, 404);
    }
    throw error;
  }
}
