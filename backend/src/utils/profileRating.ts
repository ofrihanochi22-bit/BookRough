import type { PostKind, StreamingService } from '@prisma/client';

/**
 * One row of a Public Profile's rating history (docs/features/find-people.md §4).
 * The post is a pointer to Post Detail: no links, author, comment or summary.
 */
export interface ProfileRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  community: { id: string; name: string };
  post: {
    id: string;
    sourceService: StreamingService;
    kind: PostKind | null;
    title: string | null;
    artist: string | null;
    coverArtUrl: string | null;
    conversionPending: boolean;
  };
}

/** What Prisma must select for `toProfileRating` — and nothing more. */
export const profileRatingSelect = {
  id: true,
  score: true,
  comment: true,
  createdAt: true,
  post: {
    select: {
      id: true,
      sourceService: true,
      kind: true,
      songTitle: true,
      songArtist: true,
      songCoverArtUrl: true,
      conversionPending: true,
      community: { select: { id: true, name: true } },
    },
  },
} as const;

export interface RatingWithPost {
  id: string;
  score: number;
  comment: string | null;
  createdAt: Date;
  post: {
    id: string;
    sourceService: StreamingService;
    kind: PostKind | null;
    songTitle: string | null;
    songArtist: string | null;
    songCoverArtUrl: string | null;
    conversionPending: boolean;
    community: { id: string; name: string };
  };
}

/** Field by field, never a spread. */
export function toProfileRating(rating: RatingWithPost): ProfileRating {
  const { post } = rating;
  return {
    id: rating.id,
    score: rating.score,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
    community: { id: post.community.id, name: post.community.name },
    post: {
      id: post.id,
      sourceService: post.sourceService,
      kind: post.kind,
      title: post.songTitle,
      artist: post.songArtist,
      coverArtUrl: post.songCoverArtUrl,
      conversionPending: post.conversionPending,
    },
  };
}
