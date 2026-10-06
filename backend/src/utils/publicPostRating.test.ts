import { describe, expect, it } from 'vitest';

import { toPublicPostRating } from './publicPostRating.js';

const row = {
  id: 'rating-1',
  postId: 'post-1',
  userId: 'rater-1',
  score: 8,
  comment: 'A classic',
  createdAt: new Date('2026-10-05T10:00:00.000Z'),
  updatedAt: new Date('2026-10-06T10:00:00.000Z'),
  user: { id: 'rater-1', displayName: 'Noa', profilePictureUrl: null },
};

describe('toPublicPostRating', () => {
  it('sends exactly the public keys, and only the rater fields of a member list', () => {
    // Act
    const view = toPublicPostRating(row, 'viewer-1');

    // Assert
    expect(Object.keys(view).sort()).toEqual([
      'comment',
      'createdAt',
      'id',
      'isMine',
      'rater',
      'score',
    ]);
    expect(view.rater).toEqual({ id: 'rater-1', displayName: 'Noa', profilePictureUrl: null });
    expect(view.createdAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it("marks the viewer's own rating", () => {
    // Act & Assert
    expect(toPublicPostRating(row, 'rater-1').isMine).toBe(true);
    expect(toPublicPostRating(row, 'viewer-1').isMine).toBe(false);
  });
});
