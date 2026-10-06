import { describe, expect, it } from 'vitest';

import { toPublicRating } from './publicRating.js';

describe('toPublicRating', () => {
  it('sends exactly the public keys — never the post or the rater id', () => {
    // Act
    const view = toPublicRating({
      id: 'rating-1',
      postId: 'post-1',
      userId: 'user-1',
      score: 8,
      comment: null,
      createdAt: new Date('2026-10-05T10:00:00.000Z'),
      updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    });

    // Assert
    expect(view).toEqual({
      id: 'rating-1',
      score: 8,
      comment: null,
      createdAt: '2026-10-05T10:00:00.000Z',
    });
  });
});
