import { describe, expect, it } from 'vitest';

import { isolate } from './bidi';
import { viewOf } from './notificationCopy';
import { nowFriends } from './friendCopy';

describe('isolate (manual-test-fixes-1122.md §5.1)', () => {
  it('wraps text in the first-strong isolate and pop-directional-isolate marks', () => {
    // Act
    const result = isolate('דנה');

    // Assert
    expect(result).toBe('⁨דנה⁩');
  });

  it('returns an empty string as it is, with no stray marks', () => {
    // Act / Assert
    expect(isolate('')).toBe('');
  });

  it('isolates a Hebrew name inside an English copy sentence', () => {
    // Act / Assert
    expect(nowFriends('דנה')).toBe("You're now friends with ⁨דנה⁩.");
  });

  it("isolates a notification's actor, community and song title, but not its English fallbacks", () => {
    // Arrange
    const base = {
      id: 'n1',
      at: '2026-11-22T10:00:00.000Z',
      read: false,
      communityName: null,
      count: 1,
      score: 8,
    };

    // Act
    const rated = viewOf({
      ...base,
      type: 'RATING',
      actor: { id: 'u', displayName: 'נועם', profilePictureUrl: null },
      community: null,
      post: { id: 'p', title: 'שיר.' },
    });
    const anonymous = viewOf({
      ...base,
      type: 'COMMUNITY_POSTS',
      actor: null,
      community: null,
      post: null,
    });

    // Assert
    expect(rated.lead).toBe('⁨נועם⁩');
    expect(rated.rest).toBe(' rated ⁨שיר.⁩ 8/10');
    expect(anonymous.lead).toBe('Someone');
    expect(anonymous.rest).toBe(' posted in a community');
  });
});
