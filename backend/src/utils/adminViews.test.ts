import { describe, expect, it } from 'vitest';

import { toAdminCommunity, toAdminUser } from './adminViews.js';

// Rows as a careless query might return them: more than the shapes allow.
const userRow = {
  id: 'u-1',
  googleSub: 'secret-sub',
  displayName: 'Mia',
  displayNameKey: 'mia',
  profilePictureUrl: 'https://pic/mia',
  useGooglePicture: true,
  preferredService: 'TIDAL' as const,
  role: 'ADMIN' as const,
  createdAt: new Date('2026-10-04T09:00:00.000Z'),
  updatedAt: new Date(),
  _count: { memberships: 3 },
};

describe('toAdminUser', () => {
  it('keeps exactly the admin fields', () => {
    // Act
    const result = toAdminUser(userRow);

    // Assert
    expect(result).toStrictEqual({
      id: 'u-1',
      displayName: 'Mia',
      profilePictureUrl: 'https://pic/mia',
      preferredService: 'TIDAL',
      createdAt: '2026-10-04T09:00:00.000Z',
      onboarded: true,
      isAdmin: true,
      communityCount: 3,
    });
  });

  it('describes someone who has not finished signing up, hiding the photo they have not chosen', () => {
    // Act
    const result = toAdminUser({
      ...userRow,
      displayName: null,
      preferredService: null,
      useGooglePicture: false,
      role: 'USER',
      _count: { memberships: 0 },
    });

    // Assert
    expect(result).toMatchObject({
      displayName: null,
      profilePictureUrl: null,
      onboarded: false,
      isAdmin: false,
      communityCount: 0,
    });
  });
});

describe('toAdminCommunity', () => {
  const communityRow = {
    id: 'c-1',
    name: 'Friday Jazz',
    description: 'secret description',
    inviteToken: 'secret-token',
    createdAt: new Date('2026-10-03T09:00:00.000Z'),
    _count: { members: 5 },
    members: [{ user: { id: 'u-1', displayName: 'Mia', googleSub: 'secret-sub' } }],
  };

  it('keeps name, member count, created date and a two-field owner', () => {
    // Act
    const result = toAdminCommunity(communityRow);

    // Assert
    expect(result).toStrictEqual({
      id: 'c-1',
      name: 'Friday Jazz',
      memberCount: 5,
      createdAt: '2026-10-03T09:00:00.000Z',
      owner: { id: 'u-1', displayName: 'Mia' },
    });
  });

  it('reports no owner when there is none', () => {
    // Act
    const result = toAdminCommunity({ ...communityRow, members: [] });

    // Assert
    expect(result.owner).toBeNull();
  });
});
