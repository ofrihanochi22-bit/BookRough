import { describe, expect, it } from 'vitest';

import { toFriendView } from './friendView.js';

describe('toFriendView', () => {
  it('has exactly the three member fields and since, whatever else the row carries', () => {
    // Arrange: a fuller row, as a careless select would return it.
    const row = {
      id: 'u1',
      displayName: 'Dana Levi',
      displayNameKey: 'dana levi',
      profilePictureUrl: null,
      googleSub: 'sub-dana',
      preferredService: 'TIDAL',
    };

    // Act
    const view = toFriendView(row, new Date('2026-10-06T10:00:00.000Z'));

    // Assert
    expect(view).toEqual({
      user: { id: 'u1', displayName: 'Dana Levi', profilePictureUrl: null },
      since: '2026-10-06T10:00:00.000Z',
    });
  });
});
