import type { Post, PostKind, StreamingService } from '@prisma/client';

import { type MemberUser, memberUserSelect, toMemberUser } from './communityMember.js';
import type { RatingSummary } from './ratingSummary.js';

/** The only post shape that ever leaves the server (docs/features/posts-feed.md §4). */
export interface PublicPost {
  id: string;
  author: MemberUser;
  isMine: boolean;
  /** The viewer may delete it: its author, or an admin or the owner (posts-delete.md §4). */
  canDelete: boolean;
  originalUrl: string;
  sourceService: StreamingService;
  kind: PostKind | null;
  title: string | null;
  artist: string | null;
  coverArtUrl: string | null;
  /** Only the services a link was found for. */
  links: Partial<Record<StreamingService, string>>;
  comment: string | null;
  conversionPending: boolean;
  createdAt: string;
  /** The viewer saved it to Listen Later. Only ever the viewer's own (bookmarks-my-list.md §4). */
  isBookmarked: boolean;
  /** The viewer's own score, if they rated it; never anyone else's (rate-post.md §4). */
  myScore: number | null;
  /** Every member's ratings at a glance (post-detail.md §4). */
  ratingSummary: RatingSummary;
}

export type PostWithAuthor = Post & {
  author: { id: string; displayName: string | null; profilePictureUrl: string | null };
  /** The viewer's own bookmark, if any — never anyone else's. */
  bookmarks: Array<{ userId: string }>;
  /** The viewer's own rating, if any — never anyone else's. */
  ratings: Array<{ userId: string; score: number }>;
};

/**
 * What Prisma must include for `toPublicPost`: the author's three fields, and
 * the viewer's own bookmark and rating only — no other user's row and no
 * count is ever read for a post.
 */
export function postInclude(viewerId: string) {
  return {
    author: { select: memberUserSelect },
    bookmarks: { where: { userId: viewerId }, select: { userId: true } },
    ratings: { where: { userId: viewerId }, select: { userId: true, score: true } },
  } as const;
}

/**
 * Field by field, never a spread: a column added to `posts` later must not
 * reach a client until someone adds it here on purpose. `communityId`,
 * `authorId` and `updatedAt` are deliberately absent.
 */
export function toPublicPost(
  post: PostWithAuthor,
  viewerId: string,
  viewerModerates: boolean,
  ratingSummary: RatingSummary,
): PublicPost {
  const candidates: Array<[StreamingService, string | null]> = [
    ['SPOTIFY', post.universalLinkSpotify],
    ['APPLE_MUSIC', post.universalLinkApple],
    ['YOUTUBE', post.universalLinkYoutube],
    ['TIDAL', post.universalLinkTidal],
    ['DEEZER', post.universalLinkDeezer],
  ];
  const links: Partial<Record<StreamingService, string>> = {};
  for (const [service, link] of candidates) {
    if (link) {
      links[service] = link;
    }
  }

  return {
    id: post.id,
    author: toMemberUser(post.author),
    isMine: post.authorId === viewerId,
    canDelete: post.authorId === viewerId || viewerModerates,
    originalUrl: post.originalUrl,
    sourceService: post.sourceService,
    kind: post.kind,
    title: post.songTitle,
    artist: post.songArtist,
    coverArtUrl: post.songCoverArtUrl,
    links,
    comment: post.textComment,
    conversionPending: post.conversionPending,
    createdAt: post.createdAt.toISOString(),
    isBookmarked: post.bookmarks.some((bookmark) => bookmark.userId === viewerId),
    myScore: post.ratings.find((rating) => rating.userId === viewerId)?.score ?? null,
    ratingSummary: { average: ratingSummary.average, count: ratingSummary.count },
  };
}
