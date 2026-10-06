import { describe, expect, it } from 'vitest';

import { toProfileRating, type RatingWithPost } from './profileRating.js';

describe('toProfileRating', () => {
  it('has exactly its keys, and the post exactly its seven', () => {
    // Arrange: extra fields stand in for columns a careless select would bring.
    const createdAt = new Date('2026-10-06T10:00:00.000Z');
    const rating = {
      id: 'r1',
      score: 8,
      comment: 'Nice\npick',
      createdAt,
      userId: 'u1',
      postId: 'p1',
      updatedAt: createdAt,
      post: {
        id: 'p1',
        sourceService: 'SPOTIFY',
        kind: 'ALBUM',
        songTitle: 'Abbey Road',
        songArtist: 'The Beatles',
        songCoverArtUrl: 'https://img.example/c.jpg',
        conversionPending: false,
        originalUrl: 'https://open.spotify.com/album/x',
        authorId: 'a1',
        textComment: 'secret comment',
        community: { id: 'c1', name: 'Friday Jazz', inviteToken: 'token' },
      },
    } as RatingWithPost;

    // Act
    const row = toProfileRating(rating);

    // Assert
    expect(row).toEqual({
      id: 'r1',
      score: 8,
      comment: 'Nice\npick',
      createdAt: '2026-10-06T10:00:00.000Z',
      community: { id: 'c1', name: 'Friday Jazz' },
      post: {
        id: 'p1',
        sourceService: 'SPOTIFY',
        kind: 'ALBUM',
        title: 'Abbey Road',
        artist: 'The Beatles',
        coverArtUrl: 'https://img.example/c.jpg',
        conversionPending: false,
      },
    });
  });
});
