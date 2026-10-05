import { api, type SuccessBody } from './client';
import type { PublicPost } from './posts';

/** Mirrors the backend's SavedPost (docs/features/bookmarks-my-list.md §4). */
export interface SavedPost {
  savedAt: string;
  community: { id: string; name: string };
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
}

/** Idempotent; succeeds when there was nothing to remove. */
export async function removeBookmark(postId: string): Promise<void> {
  await api.delete(`/posts/${encodeURIComponent(postId)}/bookmark`, { skipErrorToast: true });
}

/** My List shows an inline retry on failure, so no toast. */
export async function listBookmarks(before?: string): Promise<SavedPostsPage> {
  const response = await api.get<SuccessBody<SavedPostsPage>>('/users/me/bookmarks', {
    params: before ? { before } : undefined,
    skipErrorToast: true,
  });
  return response.data.data;
}
