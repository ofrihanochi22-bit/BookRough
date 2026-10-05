import type { Rating } from '@prisma/client';

import { type MemberUser, memberUserSelect, toMemberUser } from './communityMember.js';

/** One row of a post's ratings, as members see it (docs/features/post-detail.md §4). */
export interface PublicPostRating {
  id: string;
  rater: MemberUser;
  isMine: boolean;
  score: number;
  comment: string | null;
  createdAt: string;
}

export type RatingWithRater = Rating & {
  user: { id: string; displayName: string | null; profilePictureUrl: string | null };
};

/** What Prisma must include for `toPublicPostRating` — the rater's three fields only. */
export const ratingInclude = { user: { select: memberUserSelect } } as const;

/** Field by field: `postId`, `userId` and `updatedAt` are deliberately absent. */
export function toPublicPostRating(rating: RatingWithRater, viewerId: string): PublicPostRating {
  return {
    id: rating.id,
    rater: toMemberUser(rating.user),
    isMine: rating.userId === viewerId,
    score: rating.score,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
  };
}
