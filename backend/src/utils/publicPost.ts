import type { Post, PostKind, StreamingService } from '@prisma/client';

import { type MemberUser, memberUserSelect, toMemberUser } from './communityMember.js';

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
}

export type PostWithAuthor = Post & {
  author: { id: string; displayName: string | null; profilePictureUrl: string | null };
};

/** What Prisma must include for `toPublicPost` — the author's three fields only. */
export const postInclude = { author: { select: memberUserSelect } } as const;

/**
 * Field by field, never a spread: a column added to `posts` later must not
 * reach a client until someone adds it here on purpose. `communityId`,
 * `authorId` and `updatedAt` are deliberately absent.
 */
export function toPublicPost(
  post: PostWithAuthor,
  viewerId: string,
  viewerModerates: boolean,
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
  };
}
