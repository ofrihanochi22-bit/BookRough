import { api, type SuccessBody } from './client';
import type { PublicPost } from './posts';
import { cacheKeys as K, cachePrefixes as P } from '../lib/cacheKeys';
import { invalidate } from '../lib/requestCache';

/** Mirrors the backend's SavedPost (docs/features/bookmarks-my-list.md §4). */
export interface SavedPost {
  savedAt: string;
  /** Null for a direct recommendation (direct-recommendations.md §4). */
  community: { id: string; name: string } | null;
  /** Still in that community; a bookmark outlives leaving (§3.2). */
  isMember: boolean;
  post: PublicPost;
}

export interface SavedPostsPage {
  items: SavedPost[];
  nextCursor: string | null;
}

/** Idempotent. Callers show their own outcome toast, so the global one is skipped. */
export async function saveBookmark(postId: string): Promise<void> {
  await api.put(`/posts/${encodeURIComponent(postId)}/bookmark`, undefined, {
    skipErrorToast: true,
  });
  invalidate([K.myList, P.feed, K.post(postId), P.recs]);
}

/** Idempotent; succeeds when there was nothing to remove. */
export async function removeBookmark(postId: string): Promise<void> {
  await api.delete(`/posts/${encodeURIComponent(postId)}/bookmark`, { skipErrorToast: true });
  invalidate([K.myList, P.feed, K.post(postId), P.recs]);
}

/** My List shows an inline retry on failure, so no toast. */
export async function listBookmarks(before?: string): Promise<SavedPostsPage> {
  const response = await api.get<SuccessBody<SavedPostsPage>>('/users/me/bookmarks', {
    params: before ? { before } : undefined,
    skipErrorToast: true,
  });
  return response.data.data;
}
