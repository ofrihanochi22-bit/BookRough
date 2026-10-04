import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCommunities, listUsers } from './admin.service.js';

const { db } = vi.hoisted(() => ({
  db: { user: { findMany: vi.fn() }, community: { findMany: vi.fn() } },
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('listUsers', () => {
  it('reads newest first, selecting no secret column, and maps each row', async () => {
    // Arrange
    db.user.findMany.mockResolvedValue([
      {
        id: 'u-1',
        displayName: 'Mia',
        profilePictureUrl: null,
        useGooglePicture: false,
        preferredService: 'TIDAL',
        createdAt: new Date('2026-10-04T09:00:00.000Z'),
        role: 'USER',
        _count: { memberships: 2 },
      },
    ]);

    // Act
    const users = await listUsers();

    // Assert
    const query = db.user.findMany.mock.calls[0]![0];
    expect(query.orderBy[0]).toEqual({ createdAt: 'desc' });
    expect(query.select).not.toHaveProperty('googleSub');
    expect(query.select).not.toHaveProperty('displayNameKey');
    expect(users).toEqual([expect.objectContaining({ id: 'u-1', communityCount: 2 })]);
  });
});

describe('listCommunities', () => {
  it('reads newest first, asks only for the owner, and maps each row', async () => {
    // Arrange
    db.community.findMany.mockResolvedValue([
      {
        id: 'c-1',
        name: 'Friday Jazz',
        createdAt: new Date('2026-10-03T09:00:00.000Z'),
        _count: { members: 4 },
        members: [{ user: { id: 'u-1', displayName: 'Mia' } }],
      },
    ]);

    // Act
    const communities = await listCommunities();

    // Assert
    const query = db.community.findMany.mock.calls[0]![0];
    expect(query.orderBy[0]).toEqual({ createdAt: 'desc' });
    expect(query.select.members.where).toEqual({ role: 'OWNER' });
    expect(query.select).not.toHaveProperty('description');
    expect(query.select).not.toHaveProperty('inviteToken');
    expect(communities).toEqual([
      expect.objectContaining({
        id: 'c-1',
        memberCount: 4,
        owner: { id: 'u-1', displayName: 'Mia' },
      }),
    ]);
  });
});
