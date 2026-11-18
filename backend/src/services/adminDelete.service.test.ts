import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_DELETE_MESSAGES,
  deleteCommunityAsAdmin,
  deleteUser,
  previewUserDeletion,
} from './adminDelete.service.js';

const { db, notify } = vi.hoisted(() => {
  const db = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), delete: vi.fn() },
    post: { count: vi.fn() },
    rating: { count: vi.fn() },
    comment: { count: vi.fn() },
    communityMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    community: { findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  };
  return { db, notify: { role: vi.fn(), removed: vi.fn() } };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./notification.service.js', () => ({
  notifyRole: notify.role,
  notifyCommunityRemoved: notify.removed,
}));

const ADMIN = { id: 'admin-1', role: 'ADMIN' } as User;
const MIA = 'user-mia';

type Member = { userId: string; role: 'ADMIN' | 'MEMBER'; joinedAt: number; name: string };

/**
 * A fake of the member queries pickSuccessor makes: the filter and the order
 * by (joinedAt, userId) are applied here, so the tests prove the rule, not a mock.
 */
function membersOf(byCommunity: Record<string, Member[]>) {
  db.communityMember.findFirst.mockImplementation(
    async (query: {
      where: { communityId: string; role: string; userId: { not: string } };
      orderBy: unknown;
    }) => {
      expect(query.orderBy).toEqual([{ joinedAt: 'asc' }, { userId: 'asc' }]);
      const found = (byCommunity[query.where.communityId] ?? [])
        .filter((m) => m.role === query.where.role && m.userId !== query.where.userId.not)
        .sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))[0];
      return found ? { user: { id: found.userId, displayName: found.name } } : null;
    },
  );
}

function owns(...communities: { id: string; name: string }[]) {
  db.communityMember.findMany.mockResolvedValue(communities.map((community) => ({ community })));
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  db.user.findUnique.mockResolvedValue({ id: MIA, displayName: 'Mia', role: 'USER' });
  db.post.count.mockResolvedValue(12);
  db.rating.count.mockResolvedValue(30);
  db.comment.count.mockResolvedValue(8);
  db.communityMember.deleteMany.mockResolvedValue({ count: 1 });
  db.communityMember.updateMany.mockResolvedValue({ count: 1 });
  owns();
  membersOf({});
});

describe('previewUserDeletion', () => {
  it('counts what goes and hands an owned community to its oldest ADMIN', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({
      'c-jazz': [
        { userId: 'u-old-member', role: 'MEMBER', joinedAt: 1, name: 'Old' },
        { userId: 'u-ada', role: 'ADMIN', joinedAt: 5, name: 'Ada' },
        { userId: 'u-new-admin', role: 'ADMIN', joinedAt: 9, name: 'New' },
      ],
    });

    // Act
    const preview = await previewUserDeletion(ADMIN, MIA);

    // Assert
    expect(preview).toEqual({
      displayName: 'Mia',
      counts: { posts: 12, ratings: 30, comments: 8 },
      communities: [
        {
          id: 'c-jazz',
          name: 'Jazz',
          outcome: 'TRANSFER',
          newOwner: { id: 'u-ada', displayName: 'Ada' },
        },
      ],
    });
  });

  it('falls back to the oldest MEMBER when the community has no ADMIN', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({
      'c-jazz': [
        { userId: 'u-late', role: 'MEMBER', joinedAt: 7, name: 'Late' },
        { userId: 'u-early', role: 'MEMBER', joinedAt: 2, name: 'Early' },
      ],
    });

    // Act
    const preview = await previewUserDeletion(ADMIN, MIA);

    // Assert
    expect(preview.communities[0]?.newOwner).toEqual({ id: 'u-early', displayName: 'Early' });
  });

  it('breaks a tie on joined_at by user_id', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({
      'c-jazz': [
        { userId: 'u-b', role: 'MEMBER', joinedAt: 3, name: 'B' },
        { userId: 'u-a', role: 'MEMBER', joinedAt: 3, name: 'A' },
      ],
    });

    // Act
    const preview = await previewUserDeletion(ADMIN, MIA);

    // Assert
    expect(preview.communities[0]?.newOwner?.id).toBe('u-a');
  });

  it('marks a community where the user is the only member for deletion', async () => {
    // Arrange
    owns({ id: 'c-solo', name: 'Solo' });

    // Act
    const preview = await previewUserDeletion(ADMIN, MIA);

    // Assert
    expect(preview.communities).toEqual([{ id: 'c-solo', name: 'Solo', outcome: 'DELETE' }]);
  });

  it('is a 404 for a missing user', async () => {
    // Arrange
    db.user.findUnique.mockResolvedValue(null);

    // Act + Assert
    await expect(previewUserDeletion(ADMIN, MIA)).rejects.toMatchObject({
      statusCode: 404,
      message: ADMIN_DELETE_MESSAGES.userNotFound,
    });
  });

  it('is a 403 for an ADMIN target', async () => {
    // Arrange
    db.user.findUnique.mockResolvedValue({ id: MIA, displayName: 'Mia', role: 'ADMIN' });

    // Act + Assert
    await expect(previewUserDeletion(ADMIN, MIA)).rejects.toMatchObject({
      statusCode: 403,
      message: ADMIN_DELETE_MESSAGES.adminTarget,
    });
  });
});

describe('deleteUser', () => {
  it('locks the user, transfers, deletes the sole-member community, then the user', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' }, { id: 'c-solo', name: 'Solo' });
    membersOf({ 'c-jazz': [{ userId: 'u-ada', role: 'ADMIN', joinedAt: 1, name: 'Ada' }] });

    // Act
    const result = await deleteUser(ADMIN, MIA);

    // Assert
    expect(result).toEqual({
      transferred: [{ communityId: 'c-jazz', newOwnerId: 'u-ada' }],
      deletedCommunities: ['c-solo'],
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2); // the user's row, then the owned communities'
    expect(db.communityMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: MIA, communityId: 'c-jazz', role: 'OWNER' },
    });
    expect(db.communityMember.updateMany).toHaveBeenCalledWith({
      where: { communityId: 'c-jazz', userId: 'u-ada', role: 'ADMIN' },
      data: { role: 'OWNER' },
    });
    expect(db.community.delete).toHaveBeenCalledWith({ where: { id: 'c-solo' } });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: MIA } });
    // The old owner's row goes before the successor is promoted (one OWNER at a time).
    expect(db.communityMember.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.communityMember.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('tells each new owner, with the admin as the actor', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' }, { id: 'c-rock', name: 'Rock' });
    membersOf({
      'c-jazz': [{ userId: 'u-ada', role: 'ADMIN', joinedAt: 1, name: 'Ada' }],
      'c-rock': [{ userId: 'u-bo', role: 'MEMBER', joinedAt: 1, name: 'Bo' }],
    });

    // Act
    await deleteUser(ADMIN, MIA);

    // Assert
    expect(notify.role).toHaveBeenCalledWith({
      communityId: 'c-jazz',
      userId: 'u-ada',
      actorId: ADMIN.id,
      role: 'OWNER',
    });
    expect(notify.role).toHaveBeenCalledWith({
      communityId: 'c-rock',
      userId: 'u-bo',
      actorId: ADMIN.id,
      role: 'OWNER',
    });
  });

  it('tries the next candidate when the chosen one changed meanwhile', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({ 'c-jazz': [{ userId: 'u-ada', role: 'ADMIN', joinedAt: 1, name: 'Ada' }] });
    db.communityMember.updateMany.mockResolvedValueOnce({ count: 0 });

    // Act
    const result = await deleteUser(ADMIN, MIA);

    // Assert
    expect(db.communityMember.updateMany).toHaveBeenCalledTimes(2);
    expect(result.transferred).toEqual([{ communityId: 'c-jazz', newOwnerId: 'u-ada' }]);
  });

  it('is a 404 for a missing user, and deletes nothing', async () => {
    // Arrange
    db.user.findUnique.mockResolvedValue(null);

    // Act + Assert
    await expect(deleteUser(ADMIN, MIA)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('is a 403 for an ADMIN target, and deletes nothing', async () => {
    // Arrange
    db.user.findUnique.mockResolvedValue({ id: MIA, displayName: 'Mia', role: 'ADMIN' });

    // Act + Assert
    await expect(deleteUser(ADMIN, MIA)).rejects.toMatchObject({
      statusCode: 403,
      message: ADMIN_DELETE_MESSAGES.adminTarget,
    });
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('is a 403 when the admin targets themself, before reading anything', async () => {
    // Act + Assert
    await expect(deleteUser(ADMIN, ADMIN.id)).rejects.toMatchObject({
      statusCode: 403,
      message: ADMIN_DELETE_MESSAGES.selfTarget,
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('is a 409 when the user stopped owning a community meanwhile', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    db.communityMember.deleteMany.mockResolvedValue({ count: 0 });

    // Act + Assert
    await expect(deleteUser(ADMIN, MIA)).rejects.toMatchObject({
      statusCode: 409,
      message: ADMIN_DELETE_MESSAGES.changed,
    });
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('propagates a failure inside the transaction and tells nobody', async () => {
    // Arrange
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({ 'c-jazz': [{ userId: 'u-ada', role: 'ADMIN', joinedAt: 1, name: 'Ada' }] });
    db.user.delete.mockRejectedValue(new Error('connection lost'));

    // Act + Assert
    await expect(deleteUser(ADMIN, MIA)).rejects.toThrow('connection lost');
    expect(notify.role).not.toHaveBeenCalled();
  });

  it('keeps the delete when a notification fails', async () => {
    // Arrange — notifyRole is writeSafely-based and never throws; a resolved
    // undefined is what a failed write looks like from here.
    owns({ id: 'c-jazz', name: 'Jazz' });
    membersOf({ 'c-jazz': [{ userId: 'u-ada', role: 'ADMIN', joinedAt: 1, name: 'Ada' }] });
    notify.role.mockResolvedValue(undefined);

    // Act
    const result = await deleteUser(ADMIN, MIA);

    // Assert
    expect(db.user.delete).toHaveBeenCalled();
    expect(result.transferred).toHaveLength(1);
  });
});

describe('deleteCommunityAsAdmin', () => {
  it('locks and deletes the community, then tells every former member its name', async () => {
    // Arrange
    db.community.findUnique.mockResolvedValue({
      name: 'Jazz',
      members: [{ userId: 'u-1' }, { userId: 'u-2' }],
    });
    db.community.deleteMany.mockResolvedValue({ count: 1 });

    // Act
    await deleteCommunityAsAdmin(ADMIN, 'c-jazz');

    // Assert
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.community.deleteMany).toHaveBeenCalledWith({ where: { id: 'c-jazz' } });
    expect(notify.removed).toHaveBeenCalledWith({
      actorId: ADMIN.id,
      communityName: 'Jazz',
      userIds: ['u-1', 'u-2'],
    });
  });

  it('is a 404 for a missing community, and tells nobody', async () => {
    // Arrange
    db.community.findUnique.mockResolvedValue(null);

    // Act + Assert
    await expect(deleteCommunityAsAdmin(ADMIN, 'c-gone')).rejects.toMatchObject({
      statusCode: 404,
      message: ADMIN_DELETE_MESSAGES.communityNotFound,
    });
    expect(db.community.deleteMany).not.toHaveBeenCalled();
    expect(notify.removed).not.toHaveBeenCalled();
  });

  it('is a 404 when a concurrent delete got there first', async () => {
    // Arrange
    db.community.findUnique.mockResolvedValue({ name: 'Jazz', members: [] });
    db.community.deleteMany.mockResolvedValue({ count: 0 });

    // Act + Assert
    await expect(deleteCommunityAsAdmin(ADMIN, 'c-jazz')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(notify.removed).not.toHaveBeenCalled();
  });

  it('keeps the delete when the notification write fails', async () => {
    // Arrange
    db.community.findUnique.mockResolvedValue({ name: 'Jazz', members: [{ userId: 'u-1' }] });
    db.community.deleteMany.mockResolvedValue({ count: 1 });
    notify.removed.mockResolvedValue(undefined);

    // Act
    await expect(deleteCommunityAsAdmin(ADMIN, 'c-jazz')).resolves.toBeUndefined();

    // Assert
    expect(db.community.deleteMany).toHaveBeenCalled();
  });
});
