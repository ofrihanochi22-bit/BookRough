import { api, type SuccessBody } from './client';
import {
  CONVERSION_REQUEST_TIMEOUT_MS,
  type NewPost,
  type PostsPage,
  type PublicPost,
} from './posts';
import { cacheKeys as K, cachePrefixes as P } from '../lib/cacheKeys';
import { invalidate } from '../lib/requestCache';

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;

/**
 * Waits for the whole conversion, like posting (CLAUDE.md §7). UC-20,
 * docs/features/direct-recommendations.md §4.
 */
export async function sendRecommendation(recipientId: string, input: NewPost): Promise<PublicPost> {
  const response = await api.post<SuccessBody<{ post: PublicPost }>>(
    '/recommendations',
    { recipientId, ...input },
    { ...quiet, timeout: CONVERSION_REQUEST_TIMEOUT_MS },
  );
  invalidate([P.recs]);
  return response.data.data.post;
}

export async function listReceived(before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>('/recommendations/received', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function listSent(before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>('/recommendations/sent', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function countUnseenRecommendations(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>(
    '/recommendations/unseen-count',
    quiet,
  );
  return response.data.data.count;
}

export async function markRecommendationsSeen(): Promise<void> {
  await api.post('/recommendations/seen', undefined, quiet);
  // Only the unseen count changes; no cached list shows it.
  invalidate([]);
}

/** The archive — docs/features/archive-recommendations.md §4. */
export async function listArchived(before?: string): Promise<PostsPage> {
  const response = await api.get<SuccessBody<PostsPage>>('/recommendations/archived', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function countArchived(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>(
    '/recommendations/archived/count',
    quiet,
  );
  return response.data.data.count;
}

/** Idempotent; the recipient only. Received, the archive and its count all change. */
export async function archiveRecommendation(postId: string): Promise<void> {
  await api.put(`/recommendations/${encodeURIComponent(postId)}/archived`, undefined, quiet);
  invalidate([P.recs]);
}

/** Unarchive, and the Undo of Archive. Idempotent. */
export async function unarchiveRecommendation(postId: string): Promise<void> {
  await api.delete(`/recommendations/${encodeURIComponent(postId)}/archived`, quiet);
  invalidate([P.recs]);
}

/** One card of From communities: the post and the community it is in. */
export interface UncheckedItem {
  post: PublicPost;
  community: { id: string; name: string };
}

export interface UncheckedPage {
  items: UncheckedItem[];
  nextCursor: string | null;
}

/** From communities — docs/features/community-unchecked.md §4. */
export async function listUnchecked(before?: string): Promise<UncheckedPage> {
  const response = await api.get<SuccessBody<UncheckedPage>>('/recommendations/community', {
    ...quiet,
    params: before ? { before } : undefined,
  });
  return response.data.data;
}

export async function countUnchecked(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>(
    '/recommendations/community/count',
    quiet,
  );
  return response.data.data.count;
}

const COMMUNITY_KEYS = [K.recsCommunity, K.recsCommunityCount];

/** Idempotent; the caller's own post is a no-op on the server. */
export async function markChecked(postId: string): Promise<void> {
  await api.put(
    `/recommendations/community/${encodeURIComponent(postId)}/checked`,
    undefined,
    quiet,
  );
  invalidate(COMMUNITY_KEYS);
}

/** Undo of Mark checked. */
export async function unmarkChecked(postId: string): Promise<void> {
  await api.delete(`/recommendations/community/${encodeURIComponent(postId)}/checked`, quiet);
  invalidate(COMMUNITY_KEYS);
}

/**
 * Opening a link or Post Detail checks someone else's community post, in the
 * background: no toast, and a failure is ignored (§5).
 */
export function checkInBackground(post: PublicPost): void {
  if (post.direct === null && !post.isMine) {
    markChecked(post.id).catch(() => undefined);
  }
}
