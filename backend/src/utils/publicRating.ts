import type { Rating } from '@prisma/client';

/** The only rating shape that leaves the server (docs/features/rate-post.md §4). */
export interface PublicRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

/** Field by field: `postId` and `userId` are deliberately absent. */
export function toPublicRating(rating: Rating): PublicRating {
  return {
    id: rating.id,
    score: rating.score,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
  };
}
