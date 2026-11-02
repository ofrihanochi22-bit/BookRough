import { describe, expect, it, vi } from 'vitest';

import { notifyRecommendation } from './recommendationNotification.js';

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ createLogger: () => ({ info }) }));

describe('notifyRecommendation', () => {
  it('logs the ids and nothing else', () => {
    // Act
    notifyRecommendation({ senderId: 'a', recipientId: 'b', postId: 'c' });

    // Assert
    expect(info).toHaveBeenCalledWith(
      { senderId: 'a', recipientId: 'b', postId: 'c' },
      'Recommendation notification (stub)',
    );
  });
});
