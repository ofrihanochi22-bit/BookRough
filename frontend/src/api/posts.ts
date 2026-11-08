import type { StreamingService } from '../stores/auth';
import { api, type SuccessBody } from './client';
import type { MemberUser } from './membership';

/**
 * Requests that run a conversion wait longer than the client's usual 15 s: the
 * server may spend up to its 12 s ceiling converting (CLAUDE.md §7), plus a
 * cold start of several seconds in production (docs/features/production-deploy.md
 * §6). Timing out first would show an error for a post that was saved anyway,
 * and a retry would post it twice.
 */
export const CONVERSION_REQUEST_TIMEOUT_MS = 30_000;

export type PostKind = 'TRACK' | 'ALBUM' | 'VIDEO' | 'SET';

/** A platform shared without conversion (docs/features/link-only-posts.md). */
export type LinkPlatform = 'BANDCAMP' | 'SOUNDCLOUD' | 'YOUTUBE';

/** Mirrors the backend's PublicPost (docs/features/posts-feed.md §4). */
export interface PublicPost {
  id: string;
  author: { id: string; displayName: string; profilePictureUrl: string | null };
  isMine: boolean;
  /** The viewer may delete it — decided by the server (posts-delete.md §4). */
  canDelete: boolean;
  originalUrl: string;
  /** Null on a link-only post. */
  sourceService: StreamingService | null;
  /** Set on a link-only post, which is never converted (link-only-posts.md §4). */
  platform: LinkPlatform | null;
  kind: PostKind | null;
  title: string | null;
  artist: string | null;
  coverArtUrl: string | null;
  links: Partial<Record<StreamingService, string>>;
  comment: string | null;
  /** When the author last changed the comment; shown as "· edited" (edit-post-comment.md §3). */
  commentEditedAt: string | null;
  conversionPending: boolean;
  createdAt: string;
  /** The viewer saved it to Listen Later (bookmarks-my-list.md §4). */
  isBookmarked: boolean;
  /** The viewer's own score, if they rated it (rate-post.md §4). */
  myScore: number | null;
  /** Every member's ratings at a glance (post-detail.md §4). */
  ratingSummary: RatingSummary;
  /** Set on a direct recommendation (direct-recommendations.md §4). */
  direct: { recipient: MemberUser; isFriend: boolean } | null;
}

export interface RatingSummary {
  /** One decimal; null when nobody has rated. */
  average: number | null;
  count: number;
}

export interface PostsPage {
  posts: PublicPost[];
  nextCursor: string | null;
}

export interface NewPost {
  url: string;
  comment: string | null;
}

/**
 * Waits for the whole conversion (CLAUDE.md §7: up to 12 s on the server). The
 * composer shows its own errors, so the global toast is skipped.
 */
export async function createPost(communityId: string, input: NewPost): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    `/communities/${encodeURIComponent(communityId)}/posts`,
    input,
    { skipErrorToast: true, timeout: CONVERSION_REQUEST_TIMEOUT_MS },
  );
  return response.data.data.post;
}

/** The feed shows an inline retry on failure, so no toast. */
export async function listPosts(communityId: string, before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>(
    `/communities/${encodeURIComponent(communityId)}/posts`,
    { params: before ? { before } : undefined, skipErrorToast: true },
  );
  return response.data.data;
}

/** The card shows its own outcome, so no toast. */
/** The author edits their comment; the rest of a post never changes (edit-post-comment.md §4). */
export async function editPostComment(postId: string, comment: string | null): Promise<PublicPost> {
  const response = await api.patch<SuccessBody<{ post: PublicPost }>>(
    `/posts/${encodeURIComponent(postId)}/comment`,
    { comment },
    { skipErrorToast: true },
  );
  return response.data.data.post;
}

export async function retryConversion(postId: string): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    `/posts/${encodeURIComponent(postId)}/conversion`,
    undefined,
    { skipErrorToast: true, timeout: CONVERSION_REQUEST_TIMEOUT_MS },
  );
  return response.data.data.post;
}

/** The confirmation sheet shows its own outcome, so no toast. */
export async function deletePost(postId: string): Promise<void> {
  await api.delete(`/posts/${encodeURIComponent(postId)}`, { skipErrorToast: true });
}

export interface PostWithCommunity {
  post: PublicPost;
  /** Null on a direct recommendation. */
  community: { id: string; name: string } | null;
}

/** Post Detail shows the not-found page or its own retry, so no toast. */
export async function getPost(postId: string): Promise<PostWithCommunity> {
  const response = await api.get<SuccessBody<PostWithCommunity>>(
    `/posts/${encodeURIComponent(postId)}`,
    { skipErrorToast: true },
  );
  return response.data.data;
}
