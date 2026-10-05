import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { type PublicRating, toPublicRating } from '../utils/publicRating.js';
import { ALREADY_RATED } from './bookmark.service.js';
import { POST_NOT_FOUND } from './post.service.js';
import { checkPostComment } from './postText.js';
import { notifyAuthorOfRating } from './ratingNotification.js';

const log = createLogger('rating.service');

export const OWN_POST_RATING = "You can't rate your own post.";
export const SCORE_RANGE = 'Choose a score from 1 to 10.';

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
