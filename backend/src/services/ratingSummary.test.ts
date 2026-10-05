import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_RATINGS } from '../utils/ratingSummary.js';
import { ratingSummaries, summaryFor } from './ratingSummary.js';

const { groupBy } = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock('../db/prisma.js', () => ({ prisma: { rating: { groupBy } } }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ratingSummaries', () => {
  it('summarises a whole page in one grouped query', async () => {
    // Arrange
    groupBy.mockResolvedValue([{ postId: 'a', _sum: { score: 22 }, _count: { _all: 3 } }]);

    // Act
    const summaries = await ratingSummaries(['a', 'b']);

    // Assert
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['postId'],
      where: { postId: { in: ['a', 'b'] } },
      _sum: { score: true },
      _count: { _all: true },
    });
    expect(summaryFor(summaries, 'a')).toEqual({ average: 7.3, count: 3 });
    expect(summaryFor(summaries, 'b')).toBe(NO_RATINGS);
  });

  it('asks nothing for an empty page', async () => {
    // Act
    const summaries = await ratingSummaries([]);

    // Assert
    expect(groupBy).not.toHaveBeenCalled();
    expect(summaries.size).toBe(0);
  });
});
