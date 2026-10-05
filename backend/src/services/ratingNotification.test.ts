import { describe, expect, it, vi } from 'vitest';

import { notifyAuthorOfRating } from './ratingNotification.js';

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ createLogger: () => ({ info }) }));

describe('notifyAuthorOfRating (the stub)', () => {
  it('logs exactly the ids and the score — never a comment or a name', () => {
    // Act
    notifyAuthorOfRating({ authorId: 'author-1', raterId: 'rater-1', postId: 'post-1', score: 8 });

    // Assert
    expect(info).toHaveBeenCalledTimes(1);
    const [fields, message] = info.mock.calls[0]!;
    expect(fields).toEqual({
      authorId: 'author-1',
      raterId: 'rater-1',
      postId: 'post-1',
      score: 8,
    });
    expect(message).toBe('Rating notification (stub)');
  });
});
