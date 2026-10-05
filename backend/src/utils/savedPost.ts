import type { CommunityRole } from '@prisma/client';

import { type PublicPost, type PostWithAuthor, toPublicPost } from './publicPost.js';

/** One row of My List (docs/features/bookmarks-my-list.md §4). */
export interface SavedPost {
  savedAt: string;
  community: { id: string; name: string };
  /** The viewer is still in that community; a bookmark outlives membership (§3.2). */
  isMember: boolean;
  post: PublicPost;
}

export interface BookmarkWithPost {
  createdAt: Date;
  post: PostWithAuthor & {
    /** `members` holds at most the viewer's own membership. */
    community: { id: string; name: string; members: Array<{ role: CommunityRole }> };
  };
}

/**
 * Field by field: the community carries its id and name only. `viewerModerates`
 * is the viewer's admin standing there today, so `canDelete` matches the feed.
 */
export function toSavedPost(
  bookmark: BookmarkWithPost,
  viewerId: string,
  viewerModerates: boolean,
): SavedPost {
  const { community } = bookmark.post;
  return {
    savedAt: bookmark.createdAt.toISOString(),
    community: { id: community.id, name: community.name },
    isMember: community.members.length > 0,
    post: toPublicPost(bookmark.post, viewerId, viewerModerates),
  };
}
