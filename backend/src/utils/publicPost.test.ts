import type { Post } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { type PostWithAuthor, toPublicPost } from './publicPost.js';
import { NO_RATINGS } from './ratingSummary.js';

function post(overrides: Partial<Post> = {}): PostWithAuthor {
  return {
    id: 'post-1',
    authorId: 'author-1',
    communityId: 'community-1',
    originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    sourceService: 'SPOTIFY',
    kind: 'TRACK',
    songTitle: 'Bohemian Rhapsody',
    songArtist: 'Queen',
    songCoverArtUrl: 'https://img.example/cover.jpg',
    universalLinkSpotify: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    universalLinkApple: 'https://music.apple.com/us/album/x/1?i=2',
    universalLinkYoutube: null,
    universalLinkTidal: null,
    universalLinkDeezer: 'https://www.deezer.com/track/1',
    textComment: 'A classic',
    conversionPending: false,
    createdAt: new Date('2026-10-04T10:00:00.000Z'),
    updatedAt: new Date('2026-10-04T10:00:00.000Z'),
    author: { id: 'author-1', displayName: 'Dana', profilePictureUrl: null },
    bookmarks: [],
    ratings: [],
    ...overrides,
  };
}

describe('toPublicPost', () => {
  it('sends exactly the public keys, and only the author fields of a member list', () => {
    // Act
    const view = toPublicPost(post(), 'viewer-1', false, NO_RATINGS);

    // Assert
    expect(Object.keys(view).sort()).toEqual(
      [
        'artist',
        'author',
        'canDelete',
        'comment',
        'conversionPending',
        'coverArtUrl',
        'createdAt',
        'id',
        'isBookmarked',
        'isMine',
        'myScore',
        'kind',
        'links',
        'originalUrl',
        'ratingSummary',
        'sourceService',
        'title',
      ].sort(),
    );
    expect(Object.keys(view.author).sort()).toEqual(['displayName', 'id', 'profilePictureUrl']);
    expect(view.createdAt).toBe('2026-10-04T10:00:00.000Z');
  });

  it('lists only the services a link was found for', () => {
    // Act
    const { links } = toPublicPost(post(), 'viewer-1', false, NO_RATINGS);

    // Assert
    expect(links).toEqual({
      SPOTIFY: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
      APPLE_MUSIC: 'https://music.apple.com/us/album/x/1?i=2',
      DEEZER: 'https://www.deezer.com/track/1',
    });
  });

  it('marks the post as mine only for its author', () => {
    // Act & Assert
    expect(toPublicPost(post(), 'author-1', false, NO_RATINGS).isMine).toBe(true);
    expect(toPublicPost(post(), 'viewer-1', false, NO_RATINGS).isMine).toBe(false);
  });

  it('sends a pending post with no metadata and no links', () => {
    // Act
    const view = toPublicPost(
      post({
        conversionPending: true,
        kind: null,
        songTitle: null,
        songArtist: null,
        songCoverArtUrl: null,
        universalLinkSpotify: null,
        universalLinkApple: null,
        universalLinkDeezer: null,
      }),
      'viewer-1',
      false,
      NO_RATINGS,
    );

    // Assert
    expect(view).toMatchObject({ conversionPending: true, kind: null, title: null, links: {} });
  });

  it('lets the author and a moderating viewer delete, and nobody else', () => {
    // Act & Assert
    expect(toPublicPost(post(), 'author-1', false, NO_RATINGS).canDelete).toBe(true);
    expect(toPublicPost(post(), 'viewer-1', true, NO_RATINGS).canDelete).toBe(true);
    expect(toPublicPost(post(), 'viewer-1', false, NO_RATINGS).canDelete).toBe(false);
  });

  it("is bookmarked only by the viewer's own row", () => {
    // Arrange: the query reads the viewer's row only; a stray row must not count.
    const saved = { ...post(), bookmarks: [{ userId: 'viewer-1' }] };
    const someoneElses = { ...post(), bookmarks: [{ userId: 'viewer-2' }] };

    // Act & Assert
    expect(toPublicPost(saved, 'viewer-1', false, NO_RATINGS).isBookmarked).toBe(true);
    expect(toPublicPost(someoneElses, 'viewer-1', false, NO_RATINGS).isBookmarked).toBe(false);
    expect(toPublicPost(post(), 'viewer-1', false, NO_RATINGS).isBookmarked).toBe(false);
  });

  it("shows the viewer's own score only, and null when they have not rated", () => {
    // Arrange: the query reads the viewer's row only; a stray row must not count.
    const rated = { ...post(), ratings: [{ userId: 'viewer-1', score: 8 }] };
    const someoneElses = { ...post(), ratings: [{ userId: 'viewer-2', score: 3 }] };

    // Act & Assert
    expect(toPublicPost(rated, 'viewer-1', false, NO_RATINGS).myScore).toBe(8);
    expect(toPublicPost(someoneElses, 'viewer-1', false, NO_RATINGS).myScore).toBeNull();
    expect(toPublicPost(post(), 'viewer-1', false, NO_RATINGS).myScore).toBeNull();
  });

  it('copies the rating summary it is given', () => {
    // Act
    const view = toPublicPost(post(), 'viewer-1', false, { average: 7.5, count: 2 });

    // Assert
    expect(view.ratingSummary).toEqual({ average: 7.5, count: 2 });
  });
});
