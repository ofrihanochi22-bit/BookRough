import { describe, expect, it } from 'vitest';

import { type BookmarkWithPost, toSavedPost } from './savedPost.js';
import { NO_RATINGS } from './ratingSummary.js';

function bookmark(members: BookmarkWithPost['post']['community']['members']): BookmarkWithPost {
  const at = new Date('2026-10-05T10:00:00.000Z');
  return {
    createdAt: at,
    post: {
      id: 'post-1',
      authorId: 'author-1',
      communityId: 'community-1',
      originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: 'Bohemian Rhapsody',
      songArtist: 'Queen',
      songCoverArtUrl: null,
      universalLinkSpotify: null,
      universalLinkApple: null,
      universalLinkYoutube: null,
      universalLinkTidal: null,
      universalLinkDeezer: null,
      textComment: null,
      conversionPending: false,
      createdAt: at,
      updatedAt: at,
      author: { id: 'author-1', displayName: 'Dana', profilePictureUrl: null },
      bookmarks: [{ userId: 'viewer-1' }],
      ratings: [],
      community: { id: 'community-1', name: 'Friday Jazz', members },
    },
  };
}

describe('toSavedPost', () => {
  it('sends exactly the public keys, and the community as id and name only', () => {
    // Act
    const view = toSavedPost(bookmark([{ role: 'MEMBER' }]), 'viewer-1', false, NO_RATINGS);

    // Assert
    expect(Object.keys(view).sort()).toEqual(['community', 'isMember', 'post', 'savedAt']);
    expect(view.community).toEqual({ id: 'community-1', name: 'Friday Jazz' });
    expect(view.savedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(view.post).toMatchObject({ id: 'post-1', isBookmarked: true, canDelete: false });
  });

  it('is not a member once the viewer has no membership there', () => {
    // Act & Assert
    expect(toSavedPost(bookmark([]), 'viewer-1', false, NO_RATINGS).isMember).toBe(false);
    expect(
      toSavedPost(bookmark([{ role: 'ADMIN' }]), 'viewer-1', true, NO_RATINGS).post.canDelete,
    ).toBe(true);
  });
});
