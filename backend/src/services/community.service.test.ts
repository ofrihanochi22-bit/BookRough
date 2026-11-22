import type { Community, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  compareCommunities,
  createCommunity,
  getCommunity,
  listMyCommunities,
} from './community.service.js';
import { COMMUNITY_TEXT_MESSAGES } from './communityText.js';

const { communityDb, memberDb } = vi.hoisted(() => ({
  communityDb: { create: vi.fn() },
  memberDb: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { community: communityDb, communityMember: memberDb },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    displayName: 'Ofri',
    displayNameKey: 'ofri',
    profilePictureUrl: null,
    useGooglePicture: false,
    recommendationsSeenAt: null,
    walkthroughSeenAt: null,
    saveTipSeenAt: null,
    listTipSeenAt: null,
    communityChecksSince: new Date(0),
    preferredService: 'SPOTIFY',
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-1',
    name: 'Friday Jazz',
    description: null,
    inviteToken: null,
    createdAt: new Date('2026-10-03T09:00:00.000Z'),
    updatedAt: new Date('2026-10-03T09:00:00.000Z'),
    ...overrides,
  };
}

/** A membership row as Prisma returns it with the community and its member count. */
function membership(role: 'OWNER' | 'ADMIN' | 'MEMBER', community: Community, members: number) {
  return { role, community: { ...community, _count: { members } } };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
  communityDb.create.mockImplementation(({ data }: { data: Partial<Community> }) =>
    makeCommunity({ name: data.name ?? '', description: data.description ?? null }),
  );
});

describe('createCommunity', () => {
  it('creates the community with the caller as OWNER in one nested write', async () => {
    // Act
    const result = await createCommunity(makeUser(), {
      name: '  Friday   Jazz ',
      description: 'Late-night records.\n\n\n\n\nOnly.',
    });

    // Assert
    expect(communityDb.create).toHaveBeenCalledWith({
      data: {
        name: 'Friday Jazz',
        description: 'Late-night records.\n\n\nOnly.',
        members: { create: { userId: 'user-1', role: 'OWNER' } },
      },
    });
    expect(result).toMatchObject({ name: 'Friday Jazz', memberCount: 1, myRole: 'OWNER' });
  });

  it('stores a missing or blank description as null', async () => {
    // Act
    await createCommunity(makeUser(), { name: 'Friday Jazz', description: '  \n ' });

    // Assert
    expect(communityDb.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: null }),
    });
  });

  it('rejects a user who has not finished onboarding with 403', async () => {
    // Act & Assert
    await expectAppError(
      createCommunity(makeUser({ displayName: null }), { name: 'Friday Jazz' }),
      403,
      'Finish your profile first.',
    );
    expect(communityDb.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid name with 422', async () => {
    // Act & Assert
    await expectAppError(
      createCommunity(makeUser(), { name: '   ' }),
      422,
      COMMUNITY_TEXT_MESSAGES.nameRequired,
    );
    expect(communityDb.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid description with 422', async () => {
    // Act & Assert
    await expectAppError(
      createCommunity(makeUser(), { name: 'Friday Jazz', description: 'x'.repeat(281) }),
      422,
      COMMUNITY_TEXT_MESSAGES.descriptionLength,
    );
    expect(communityDb.create).not.toHaveBeenCalled();
  });
});

describe('listMyCommunities', () => {
  it("returns the caller's communities with counts and roles, alphabetically by name", async () => {
    // Arrange — the query returns them in join order; the service sorts.
    memberDb.findMany.mockResolvedValue([
      membership('MEMBER', makeCommunity({ id: 'c-older', name: 'older' }), 4),
      membership('ADMIN', makeCommunity({ id: 'c-bravo', name: 'Bravo' }), 1),
      membership('OWNER', makeCommunity({ id: 'c-alpha', name: 'alpha' }), 2),
    ]);

    // Act
    const result = await listMyCommunities(makeUser());

    // Assert
    expect(memberDb.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(result.map(({ id, memberCount, myRole }) => ({ id, memberCount, myRole }))).toEqual([
      { id: 'c-alpha', memberCount: 2, myRole: 'OWNER' },
      { id: 'c-bravo', memberCount: 1, myRole: 'ADMIN' },
      { id: 'c-older', memberCount: 4, myRole: 'MEMBER' },
    ]);
  });

  it('sorts digits first, then Latin, then Hebrew in alphabet order', async () => {
    // Arrange
    memberDb.findMany.mockResolvedValue(
      ['מזרחית ותיקה', 'Indie Rock Night', 'אהבה', '90s Mix', 'Jazz & Coffee'].map((name, i) =>
        membership('MEMBER', makeCommunity({ id: `c-${i}`, name }), 1),
      ),
    );

    // Act
    const result = await listMyCommunities(makeUser());

    // Assert
    expect(result.map(({ name }) => name)).toEqual([
      '90s Mix',
      'Indie Rock Night',
      'Jazz & Coffee',
      'אהבה',
      'מזרחית ותיקה',
    ]);
  });

  it('returns an empty list for a user in no communities', async () => {
    // Arrange
    memberDb.findMany.mockResolvedValue([]);

    // Act & Assert
    expect(await listMyCommunities(makeUser())).toEqual([]);
  });
});

describe('getCommunity', () => {
  it('returns the community to a member, looked up by the composite key', async () => {
    // Arrange
    memberDb.findUnique.mockResolvedValue(membership('ADMIN', makeCommunity(), 2));

    // Act
    const result = await getCommunity(makeUser(), 'community-1');

    // Assert
    expect(memberDb.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_communityId: { userId: 'user-1', communityId: 'community-1' } },
      }),
    );
    expect(result).toMatchObject({ id: 'community-1', memberCount: 2, myRole: 'ADMIN' });
  });

  it('gives a non-member, or a missing community, the same 404', async () => {
    // Arrange
    memberDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(getCommunity(makeUser(), 'community-1'), 404, 'Community not found.');
  });
});

describe('compareCommunities', () => {
  it('sorts numbers by value', () => {
    // Arrange
    const names = ['Mix 10', 'Mix 2', 'Mix 1'].map((name) => ({ id: name, name }));

    // Act
    const sorted = [...names].sort(compareCommunities).map(({ name }) => name);

    // Assert
    expect(sorted).toEqual(['Mix 1', 'Mix 2', 'Mix 10']);
  });

  it('ignores case and accents', () => {
    // Act / Assert
    expect(compareCommunities({ id: 'a', name: 'Café' }, { id: 'b', name: 'cafe' })).toBeLessThan(
      0,
    );
    expect(
      compareCommunities({ id: 'a', name: 'zebra' }, { id: 'b', name: 'Apple' }),
    ).toBeGreaterThan(0);
  });

  it('breaks a tie between equal names by id, so the order is stable', () => {
    // Arrange
    const first = { id: 'c-1', name: 'Indie' };
    const second = { id: 'c-2', name: 'indie' };

    // Act / Assert
    expect(compareCommunities(first, second)).toBeLessThan(0);
    expect(compareCommunities(second, first)).toBeGreaterThan(0);
    expect(compareCommunities(first, { ...first })).toBe(0);
  });
});
