import { describe, expect, it } from 'vitest';

import { toProfileUser } from './profileUser.js';

describe('toProfileUser', () => {
  it('has exactly its four keys, whatever else the row carries', () => {
    // Arrange: a full row, as a careless select would return it.
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      googleSub: 'sub-dana',
      displayName: 'Dana Levi',
      displayNameKey: 'dana levi',
      profilePictureUrl: null,
      useGooglePicture: false,
      preferredService: 'TIDAL' as const,
      role: 'ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Act
    const user = toProfileUser(row);

    // Assert
    expect(user).toEqual({
      id: row.id,
      displayName: 'Dana Levi',
      profilePictureUrl: null,
      preferredService: 'TIDAL',
    });
  });
});
