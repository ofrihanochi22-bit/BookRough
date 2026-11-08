import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  CANNOT_REMOVE_ADMIN,
  MEMBER_NOT_FOUND,
  OWNERSHIP_CHANGED,
  OWNER_CANNOT_LEAVE,
  changeRole,
  leaveCommunity,
  listMembers,
  removeMember,
  transferOwnership,
  unblock,
} from './membership.service.js';

/**
 * Unit tests for the branches an integration test cannot reach on demand: the
 * moment a concurrent change makes a conditional write match nothing.
 */

const { memberDb, banDb, postDb, ratingDb, invitationDb, transaction, getCommunity, notifyRole } =
  vi.hoisted(() => ({
    notifyRole: vi.fn(),
    memberDb: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    banDb: { upsert: vi.fn(), deleteMany: vi.fn() },
    postDb: { deleteMany: vi.fn() },
    ratingDb: { deleteMany: vi.fn() },
    invitationDb: { deleteMany: vi.fn() },
    transaction: vi.fn(),
    getCommunity: vi.fn(),
  }));

vi.mock('../db/prisma.js', () => ({
  prisma: { communityMember: memberDb, communityBan: banDb, $transaction: transaction },
}));
vi.mock('./community.service.js', () => ({ getCommunity }));
vi.mock('./notification.service.js', () => ({ notifyRole }));

const CALLER = 'caller-id';
const TARGET = 'target-id';
const COMMUNITY = 'community-id';

const caller = { id: CALLER } as User;

/** Roles by user id, as successive findUnique calls see them. */
function roles(...sequence: Array<Record<string, string | null>>) {
  for (const snapshot of sequence) {
    memberDb.findUnique.mockImplementationOnce(
      ({ where }: { where: { userId_communityId: { userId: string } } }) => {
        const role = snapshot[where.userId_communityId.userId];
        return Promise.resolve(role ? { role } : null);
      },
    );
  }
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Interactive transactions run their callback against the same mocks.
  transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      communityMember: memberDb,
      communityBan: banDb,
      post: postDb,
      rating: ratingDb,
      communityInvitation: invitationDb,
    }),
  );
});

describe('listMembers', () => {
  it('orders owner, admins, members, keeping join order within each', async () => {
    // Arrange
    roles({ [CALLER]: 'MEMBER' });
    const row = (name: string, role: string) => ({
      role,
      joinedAt: new Date('2026-10-04'),
      user: { id: name, displayName: name, profilePictureUrl: null },
    });
    memberDb.findMany.mockResolvedValue([
      row('m1', 'MEMBER'),
      row('a1', 'ADMIN'),
      row('o', 'OWNER'),
      row('m2', 'MEMBER'),
      row('a2', 'ADMIN'),
    ]);

    // Act
    const result = await listMembers(caller, COMMUNITY);

    // Assert
    expect(result.map((member) => member.user.id)).toEqual(['o', 'a1', 'a2', 'm1', 'm2']);
  });
});

describe('leaveCommunity — races', () => {
  it('refuses when the caller became the owner between the check and the delete', async () => {
    // Arrange — ADMIN at the check, OWNER by the time the delete runs.
    roles({ [CALLER]: 'ADMIN' }, { [CALLER]: 'OWNER' });
    memberDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(leaveCommunity(caller, COMMUNITY), 409, OWNER_CANNOT_LEAVE);
    expect(memberDb.deleteMany).toHaveBeenCalledWith({
      where: { userId: CALLER, communityId: COMMUNITY, role: { not: 'OWNER' } },
    });
  });

  it('answers 404 when the caller was removed meanwhile', async () => {
    // Arrange
    roles({ [CALLER]: 'MEMBER' }, {});
    memberDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(leaveCommunity(caller, COMMUNITY), 404);
  });
});

describe('removeMember — races', () => {
  it('only deletes while the target is still a MEMBER, and writes the ban and deletes their posts and ratings in the same transaction', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' });
    memberDb.deleteMany.mockResolvedValue({ count: 1 });
    postDb.deleteMany.mockResolvedValue({ count: 3 });
    ratingDb.deleteMany.mockResolvedValue({ count: 2 });

    // Act
    await removeMember(caller, COMMUNITY, TARGET);

    // Assert
    expect(memberDb.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET, communityId: COMMUNITY, role: 'MEMBER' },
    });
    expect(banDb.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { communityId: COMMUNITY, userId: TARGET, bannedById: CALLER },
      }),
    );
    expect(postDb.deleteMany).toHaveBeenCalledWith({
      where: { authorId: TARGET, communityId: COMMUNITY },
    });
    expect(ratingDb.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET, post: { communityId: COMMUNITY } },
    });
  });

  it('refuses, and bans nobody, when the target was promoted between the check and the delete', async () => {
    // Arrange — MEMBER at the check, ADMIN afterwards.
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' }, { [TARGET]: 'ADMIN' });
    memberDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(removeMember(caller, COMMUNITY, TARGET), 409, CANNOT_REMOVE_ADMIN);
    expect(banDb.upsert).not.toHaveBeenCalled();
    expect(postDb.deleteMany).not.toHaveBeenCalled();
    expect(ratingDb.deleteMany).not.toHaveBeenCalled();
  });

  it('answers 404 when another admin removed the target first', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' }, {});
    memberDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(removeMember(caller, COMMUNITY, TARGET), 404, MEMBER_NOT_FOUND);
  });
});

describe('changeRole — races', () => {
  it('never touches an owner: the update is limited to ADMIN and MEMBER rows', async () => {
    // Arrange — ADMIN at the check, made OWNER by a transfer before the update.
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'ADMIN' }, { [TARGET]: 'OWNER' });
    memberDb.updateMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(changeRole(caller, COMMUNITY, TARGET, 'MEMBER'), 409);
    expect(memberDb.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET, communityId: COMMUNITY, role: { in: ['ADMIN', 'MEMBER'] } },
      data: { role: 'MEMBER' },
    });
  });

  it('answers 404 when the target left between the update and the read-back', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' }, {});
    memberDb.updateMany.mockResolvedValue({ count: 1 });

    // Act & Assert
    await expectAppError(changeRole(caller, COMMUNITY, TARGET, 'ADMIN'), 404, MEMBER_NOT_FOUND);
  });
});

describe('transferOwnership — races', () => {
  beforeEach(() => {
    roles({ [CALLER]: 'OWNER' }, { [TARGET]: 'MEMBER' });
  });

  it('demotes the caller first and only while they are still the owner, then promotes', async () => {
    // Arrange
    memberDb.updateMany.mockResolvedValue({ count: 1 });
    getCommunity.mockResolvedValue({ id: COMMUNITY, myRole: 'ADMIN' });

    // Act
    await transferOwnership(caller, COMMUNITY, TARGET);

    // Assert
    expect(memberDb.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { userId: CALLER, communityId: COMMUNITY, role: 'OWNER' }, data: { role: 'ADMIN' } },
      { where: { userId: TARGET, communityId: COMMUNITY }, data: { role: 'OWNER' } },
    ]);
  });

  it('refuses with 409 when the caller stopped being the owner in the meantime', async () => {
    // Arrange
    memberDb.updateMany.mockResolvedValueOnce({ count: 0 });

    // Act & Assert
    await expectAppError(transferOwnership(caller, COMMUNITY, TARGET), 409, OWNERSHIP_CHANGED);
    expect(memberDb.updateMany).toHaveBeenCalledTimes(1);
  });

  it('answers 404 (and the transaction rolls back) when the target left in the meantime', async () => {
    // Arrange
    memberDb.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    // Act & Assert
    await expectAppError(transferOwnership(caller, COMMUNITY, TARGET), 404, MEMBER_NOT_FOUND);
  });

  it('turns a second-owner violation of the partial index into a 409', async () => {
    // Arrange
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    // Act & Assert
    await expectAppError(transferOwnership(caller, COMMUNITY, TARGET), 409, OWNERSHIP_CHANGED);
  });

  it('rethrows anything else', async () => {
    // Arrange
    transaction.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(transferOwnership(caller, COMMUNITY, TARGET)).rejects.toThrow('connection lost');
  });
});

describe('unblock', () => {
  it('answers 404 when the person is not blocked', async () => {
    // Arrange
    roles({ [CALLER]: 'OWNER' });
    banDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(unblock(caller, COMMUNITY, TARGET), 404, "This person isn't blocked.");
  });
});

/** Role notifications — docs/features/role-notifications.md §7. */
describe('changeRole and transferOwnership — notifications', () => {
  const readBack = (role: string) =>
    memberDb.findUnique.mockResolvedValueOnce({
      role,
      joinedAt: new Date('2026-11-01T00:00:00.000Z'),
      user: { id: TARGET, displayName: 'Noam', profilePictureUrl: null },
    });

  it('tells a member they were made an admin', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' });
    readBack('ADMIN');
    memberDb.updateMany.mockResolvedValue({ count: 1 });

    // Act
    await changeRole(caller, COMMUNITY, TARGET, 'ADMIN');

    // Assert
    expect(notifyRole).toHaveBeenCalledWith({
      communityId: COMMUNITY,
      userId: TARGET,
      actorId: CALLER,
      role: 'ADMIN',
    });
  });

  it('tells nobody when the member already was an admin', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'ADMIN' });
    readBack('ADMIN');
    memberDb.updateMany.mockResolvedValue({ count: 1 });

    // Act
    await changeRole(caller, COMMUNITY, TARGET, 'ADMIN');

    // Assert
    expect(notifyRole).not.toHaveBeenCalled();
  });

  it('keeps a demotion silent', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'ADMIN' });
    readBack('MEMBER');
    memberDb.updateMany.mockResolvedValue({ count: 1 });

    // Act
    await changeRole(caller, COMMUNITY, TARGET, 'MEMBER');

    // Assert
    expect(notifyRole).not.toHaveBeenCalled();
  });

  it('tells nobody when the change was refused (the target became the owner)', async () => {
    // Arrange
    roles({ [CALLER]: 'ADMIN' }, { [TARGET]: 'MEMBER' }, { [TARGET]: 'OWNER' });
    memberDb.updateMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(changeRole(caller, COMMUNITY, TARGET, 'ADMIN'), 409);
    expect(notifyRole).not.toHaveBeenCalled();
  });

  it('tells the new owner after a transfer, and nobody when it fails', async () => {
    // Arrange
    roles({ [CALLER]: 'OWNER' }, { [TARGET]: 'MEMBER' });
    memberDb.updateMany.mockResolvedValue({ count: 1 });
    getCommunity.mockResolvedValue({ id: COMMUNITY, myRole: 'ADMIN' });

    // Act
    await transferOwnership(caller, COMMUNITY, TARGET);

    // Assert
    expect(notifyRole).toHaveBeenCalledWith({
      communityId: COMMUNITY,
      userId: TARGET,
      actorId: CALLER,
      role: 'OWNER',
    });

    // Arrange — the target left meanwhile.
    notifyRole.mockClear();
    roles({ [CALLER]: 'OWNER' }, { [TARGET]: 'MEMBER' });
    memberDb.updateMany.mockReset();
    memberDb.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    // Act & Assert
    await expectAppError(transferOwnership(caller, COMMUNITY, TARGET), 404);
    expect(notifyRole).not.toHaveBeenCalled();
  });
});
