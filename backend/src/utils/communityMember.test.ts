import { describe, expect, it } from 'vitest';

import { toBlockedUser, toCommunityMember } from './communityMember.js';

// Rows as a careless query might return them: far more than the shapes allow.
const user = {
  id: 'u-1',
  displayName: 'Mia',
  profilePictureUrl: null,
  googleSub: 'secret-sub',
  preferredService: 'TIDAL',
  createdAt: new Date(),
};

describe('member serialisers', () => {
  it('toCommunityMember keeps exactly role, joinedAt and a three-field user', () => {
    // Act
    const result = toCommunityMember({
      role: 'ADMIN',
      joinedAt: new Date('2026-10-04T09:00:00.000Z'),
      user,
    });

    // Assert
    expect(result).toStrictEqual({
      user: { id: 'u-1', displayName: 'Mia', profilePictureUrl: null },
      role: 'ADMIN',
      joinedAt: '2026-10-04T09:00:00.000Z',
    });
  });

  it('toBlockedUser keeps exactly blockedAt and a three-field user', () => {
    // Act
    const result = toBlockedUser({ createdAt: new Date('2026-10-04T10:00:00.000Z'), user });

    // Assert
    expect(result).toStrictEqual({
      user: { id: 'u-1', displayName: 'Mia', profilePictureUrl: null },
      blockedAt: '2026-10-04T10:00:00.000Z',
    });
  });

  it('falls back to "Unknown" for a row without a display name', () => {
    // Act & Assert
    expect(
      toBlockedUser({ createdAt: new Date(), user: { ...user, displayName: null } }).user
        .displayName,
    ).toBe('Unknown');
  });
});
