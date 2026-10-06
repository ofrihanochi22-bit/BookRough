import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  acceptInvitation,
  cancelInvitation,
  countMyInvitations,
  declineInvitation,
  INVITATION_GONE,
  inviteFriends,
  listCandidates,
  listMyInvitations,
} from './invitation.service.js';

/**
 * Every branch of the invitation service, with Prisma, friends and community
 * access mocked. The same rules run against Postgres in
 * routes/invitations.integration.test.ts.
 */

const { db, access, friends, notify } = vi.hoisted(() => {
  const db = {
    communityMember: { findMany: vi.fn(), createMany: vi.fn() },
    communityBan: { findMany: vi.fn() },
    communityInvitation: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    db,
    access: { requireAdmin: vi.fn(), isBanned: vi.fn() },
    friends: { listFriends: vi.fn() },
    notify: { notifyInvitation: vi.fn() },
  };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./communityAccess.js', () => access);
vi.mock('./friend.service.js', () => friends);
vi.mock('./invitationNotification.js', () => notify);

const ME = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ofri',
  preferredService: 'SPOTIFY',
} as User;
const ONBOARDING = { ...ME, displayName: null, preferredService: null } as User;
const COMMUNITY = '22222222-2222-4222-8222-222222222222';

const person = (id: string, name: string) => ({ id, displayName: name, profilePictureUrl: null });
const friend = (id: string, name: string) => ({ user: person(id, name), since: 'x' });

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

/** Ada a member, Bea blocked, Cai invited, Dov invitable. */
function standings() {
  friends.listFriends.mockResolvedValue([
    friend('ada', 'Ada'),
    friend('bea', 'Bea'),
    friend('cai', 'Cai'),
    friend('dov', 'Dov'),
  ]);
  db.communityMember.findMany.mockResolvedValue([{ userId: 'ada' }]);
  db.communityBan.findMany.mockResolvedValue([{ userId: 'bea' }]);
  db.communityInvitation.findMany.mockResolvedValue([{ userId: 'cai' }]);
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  access.requireAdmin.mockResolvedValue('ADMIN');
  access.isBanned.mockResolvedValue(false);
});

describe('listCandidates', () => {
  it("gives every friend their standing, in listFriends' alphabetical order", async () => {
    // Arrange
    standings();

    // Act
    const candidates = await listCandidates(ME, COMMUNITY);

    // Assert
    expect(candidates).toEqual([
      { user: person('ada', 'Ada'), status: 'MEMBER' },
      { user: person('bea', 'Bea'), status: 'BLOCKED' },
      { user: person('cai', 'Cai'), status: 'INVITED' },
      { user: person('dov', 'Dov'), status: 'INVITABLE' },
    ]);
    expect(access.requireAdmin).toHaveBeenCalledWith(
      ME,
      COMMUNITY,
      'Only admins can invite people.',
    );
  });

  it('refuses a non-admin with whatever requireAdmin throws, and a caller mid-onboarding', async () => {
    // Arrange
    access.requireAdmin.mockRejectedValue(new AppError('Only admins can invite people.', 403));

    // Act & Assert
    await expectAppError(listCandidates(ME, COMMUNITY), 403);
    await expectAppError(listCandidates(ONBOARDING, COMMUNITY), 403, 'Finish your profile first.');
  });
});

describe('inviteFriends', () => {
  it('invites only the invitable friends, once each, and notifies each', async () => {
    // Arrange
    standings();

    // Act
    await inviteFriends(ME, COMMUNITY, ['dov', 'dov', 'ada', 'bea', 'cai', 'stranger']);

    // Assert
    expect(db.communityInvitation.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNITY, userId: 'dov', invitedById: ME.id }],
      skipDuplicates: true,
    });
    expect(notify.notifyInvitation).toHaveBeenCalledTimes(1);
    expect(notify.notifyInvitation).toHaveBeenCalledWith({
      communityId: COMMUNITY,
      userId: 'dov',
      invitedById: ME.id,
    });
  });

  it('writes nothing when nobody is invitable, and returns the list', async () => {
    // Arrange
    standings();

    // Act
    const candidates = await inviteFriends(ME, COMMUNITY, ['ada', 'stranger']);

    // Assert
    expect(db.communityInvitation.createMany).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(4);
  });

  it('keeps the invitations when the notification stub throws', async () => {
    // Arrange
    standings();
    notify.notifyInvitation.mockImplementation(() => {
      throw new Error('stub broke');
    });

    // Act & Assert
    await expect(inviteFriends(ME, COMMUNITY, ['dov'])).resolves.toHaveLength(4);
    expect(db.communityInvitation.createMany).toHaveBeenCalled();
  });

  it('refuses a non-admin before reading anything', async () => {
    // Arrange
    access.requireAdmin.mockRejectedValue(new AppError('Community not found.', 404));

    // Act & Assert
    await expectAppError(inviteFriends(ME, COMMUNITY, ['dov']), 404);
    expect(friends.listFriends).not.toHaveBeenCalled();
  });
});

describe('cancelInvitation', () => {
  it('deletes the invitation, idempotently, and returns the list', async () => {
    // Arrange
    standings();
    db.communityInvitation.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      count: 0,
    });

    // Act
    await cancelInvitation(ME, COMMUNITY, 'cai');
    const again = await cancelInvitation(ME, COMMUNITY, 'cai');

    // Assert
    expect(db.communityInvitation.deleteMany).toHaveBeenCalledWith({
      where: { communityId: COMMUNITY, userId: 'cai' },
    });
    expect(again).toHaveLength(4);
  });

  it('refuses a non-admin', async () => {
    // Arrange
    access.requireAdmin.mockRejectedValue(new AppError('Only admins can invite people.', 403));

    // Act & Assert
    await expectAppError(cancelInvitation(ME, COMMUNITY, 'cai'), 403);
    expect(db.communityInvitation.deleteMany).not.toHaveBeenCalled();
  });
});

describe('my invitations', () => {
  it('lists them newest first, with member count and inviter (or null)', async () => {
    // Arrange
    const at = new Date('2026-10-06T10:00:00.000Z');
    db.communityInvitation.findMany.mockResolvedValue([
      {
        createdAt: at,
        community: { id: COMMUNITY, name: 'Crew', _count: { members: 3 } },
        invitedBy: person('dana', 'Dana'),
      },
      {
        createdAt: at,
        community: { id: 'c2', name: 'Club', _count: { members: 1 } },
        invitedBy: null,
      },
    ]);

    // Act
    const invitations = await listMyInvitations(ME);

    // Assert
    const query = db.communityInvitation.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ userId: ME.id });
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(invitations).toEqual([
      {
        community: { id: COMMUNITY, name: 'Crew', memberCount: 3 },
        invitedBy: person('dana', 'Dana'),
        sentAt: at.toISOString(),
      },
      {
        community: { id: 'c2', name: 'Club', memberCount: 1 },
        invitedBy: null,
        sentAt: at.toISOString(),
      },
    ]);
  });

  it('counts them', async () => {
    // Arrange
    db.communityInvitation.count.mockResolvedValue(2);

    // Act & Assert
    await expect(countMyInvitations(ME)).resolves.toBe(2);
    expect(db.communityInvitation.count).toHaveBeenCalledWith({ where: { userId: ME.id } });
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(listMyInvitations(ONBOARDING), 403);
    await expectAppError(countMyInvitations(ONBOARDING), 403);
  });
});

describe('acceptInvitation', () => {
  it('uses up the invitation and joins as MEMBER, together', async () => {
    // Arrange
    db.communityInvitation.deleteMany.mockResolvedValue({ count: 1 });

    // Act
    const community = await acceptInvitation(ME, COMMUNITY);

    // Assert
    expect(community).toEqual({ id: COMMUNITY });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.communityInvitation.deleteMany).toHaveBeenCalledWith({
      where: { communityId: COMMUNITY, userId: ME.id },
    });
    expect(db.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ userId: ME.id, communityId: COMMUNITY, role: 'MEMBER' }],
      skipDuplicates: true,
    });
  });

  it('throws 404 and joins nobody without an invitation', async () => {
    // Arrange
    db.communityInvitation.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(acceptInvitation(ME, COMMUNITY), 404, INVITATION_GONE);
    expect(db.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('throws the same 404 for a blocked caller, and deletes the invitation', async () => {
    // Arrange
    access.isBanned.mockResolvedValue(true);

    // Act & Assert
    await expectAppError(acceptInvitation(ME, COMMUNITY), 404, INVITATION_GONE);
    expect(db.communityInvitation.deleteMany).toHaveBeenCalledWith({
      where: { communityId: COMMUNITY, userId: ME.id },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(acceptInvitation(ONBOARDING, COMMUNITY), 403);
  });
});

describe('declineInvitation', () => {
  it("deletes only the caller's invitation, idempotently", async () => {
    // Arrange
    db.communityInvitation.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      count: 0,
    });

    // Act
    await declineInvitation(ME, COMMUNITY);
    await declineInvitation(ME, COMMUNITY);

    // Assert
    expect(db.communityInvitation.deleteMany).toHaveBeenCalledWith({
      where: { communityId: COMMUNITY, userId: ME.id },
    });
    expect(db.communityInvitation.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(declineInvitation(ONBOARDING, COMMUNITY), 403);
  });
});
