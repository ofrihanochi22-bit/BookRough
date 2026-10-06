import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  acceptRequest,
  cancelRequest,
  countRequests,
  friendshipOf,
  ignoreRequest,
  listFriends,
  listRequests,
  removeFriend,
  REQUEST_GONE,
  SELF_REQUEST,
  SENDER_GONE,
  sendRequest,
} from './friend.service.js';
import { USER_NOT_FOUND } from './profile.service.js';

/**
 * Every branch of the friend service, Prisma mocked — including the ones that
 * cannot be reached on demand against a real database (a racing insert, a
 * request withdrawn mid-send, a failing notification). The same rules are
 * proven against Postgres in routes/friends.integration.test.ts.
 */

const { db, notify } = vi.hoisted(() => {
  const db = {
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    friend: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    db,
    notify: { notifyFriendRequest: vi.fn(), notifyFriendAccepted: vi.fn() },
  };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./friendNotification.js', () => notify);

const ME = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ofri',
  preferredService: 'SPOTIFY',
} as User;
const ONBOARDING = { ...ME, displayName: null, preferredService: null } as User;
const DANA = '22222222-2222-4222-8222-222222222222';
const danaUser = {
  id: DANA,
  displayName: 'Dana Levi',
  profilePictureUrl: null,
  preferredService: 'TIDAL',
};

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

const pending = (requesterId: string, addresseeId: string) => ({
  requesterId,
  addresseeId,
  status: 'PENDING',
});
const accepted = (requesterId: string, addresseeId: string) => ({
  requesterId,
  addresseeId,
  status: 'ACCEPTED',
});

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  db.user.findFirst.mockResolvedValue(danaUser);
});

describe('sendRequest', () => {
  it('creates a pending request and notifies the addressee', async () => {
    // Arrange: no row, then the new one when the relation is read back.
    db.friend.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pending(ME.id, DANA));

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(friendship).toBe('REQUEST_SENT');
    expect(db.friend.create).toHaveBeenCalledWith({
      data: { requesterId: ME.id, addresseeId: DANA },
    });
    expect(notify.notifyFriendRequest).toHaveBeenCalledWith({
      requesterId: ME.id,
      addresseeId: DANA,
    });
    expect(notify.notifyFriendAccepted).not.toHaveBeenCalled();
  });

  it('is idempotent when the caller already sent one', async () => {
    // Arrange
    db.friend.findFirst.mockResolvedValue(pending(ME.id, DANA));

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(friendship).toBe('REQUEST_SENT');
    expect(db.friend.create).not.toHaveBeenCalled();
    expect(notify.notifyFriendRequest).not.toHaveBeenCalled();
  });

  it("accepts the target's pending request instead, and notifies them", async () => {
    // Arrange
    db.friend.findFirst
      .mockResolvedValueOnce(pending(DANA, ME.id))
      .mockResolvedValueOnce(accepted(DANA, ME.id));
    db.friend.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(friendship).toBe('FRIENDS');
    expect(db.friend.updateMany).toHaveBeenCalledWith({
      where: { requesterId: DANA, addresseeId: ME.id, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    expect(db.friend.create).not.toHaveBeenCalled();
    expect(notify.notifyFriendAccepted).toHaveBeenCalledWith({
      requesterId: DANA,
      addresseeId: ME.id,
    });
  });

  it('sends a plain request when their request was withdrawn mid-send', async () => {
    // Arrange: read as pending, gone by the update.
    db.friend.findFirst
      .mockResolvedValueOnce(pending(DANA, ME.id))
      .mockResolvedValueOnce(pending(ME.id, DANA));
    db.friend.updateMany.mockResolvedValue({ count: 0 });

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(friendship).toBe('REQUEST_SENT');
    expect(db.friend.create).toHaveBeenCalledWith({
      data: { requesterId: ME.id, addresseeId: DANA },
    });
    expect(notify.notifyFriendRequest).toHaveBeenCalled();
  });

  it('returns FRIENDS unchanged when already friends', async () => {
    // Arrange
    db.friend.findFirst.mockResolvedValue(accepted(DANA, ME.id));

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(friendship).toBe('FRIENDS');
    expect(db.friend.create).not.toHaveBeenCalled();
    expect(db.friend.updateMany).not.toHaveBeenCalled();
  });

  it('resolves a racing opposite insert (P2002) as mutual acceptance', async () => {
    // Arrange: the first attempt saw nothing and lost the insert race.
    db.friend.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending(DANA, ME.id))
      .mockResolvedValueOnce(accepted(DANA, ME.id));
    db.friend.create.mockRejectedValueOnce(p2002());
    db.friend.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const friendship = await sendRequest(ME, DANA);

    // Assert
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(friendship).toBe('FRIENDS');
  });

  it('rethrows any other database error', async () => {
    // Arrange
    db.friend.findFirst.mockResolvedValueOnce(null);
    db.friend.create.mockRejectedValueOnce(new Error('connection lost'));

    // Act & Assert
    await expect(sendRequest(ME, DANA)).rejects.toThrow('connection lost');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the request when the notification stub throws', async () => {
    // Arrange
    db.friend.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pending(ME.id, DANA));
    notify.notifyFriendRequest.mockImplementation(() => {
      throw new Error('stub broke');
    });

    // Act & Assert
    await expect(sendRequest(ME, DANA)).resolves.toBe('REQUEST_SENT');
  });

  it('throws 422 for yourself, 404 for an unknown or mid-onboarding user, 403 mid-onboarding', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(sendRequest(ME, ME.id), 422, SELF_REQUEST);
    await expectAppError(sendRequest(ME, DANA), 404, USER_NOT_FOUND);
    await expectAppError(sendRequest(ONBOARDING, DANA), 403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('cancelRequest', () => {
  it("deletes only the caller's pending request", async () => {
    // Arrange
    db.friend.deleteMany.mockResolvedValue({ count: 1 });
    db.friend.findFirst.mockResolvedValue(null);

    // Act
    const friendship = await cancelRequest(ME, DANA);

    // Assert
    expect(db.friend.deleteMany).toHaveBeenCalledWith({
      where: { requesterId: ME.id, addresseeId: DANA, status: 'PENDING' },
    });
    expect(friendship).toBe('NONE');
  });

  it('is idempotent, and leaves a friendship alone', async () => {
    // Arrange: nothing pending; they are friends.
    db.friend.deleteMany.mockResolvedValue({ count: 0 });
    db.friend.findFirst.mockResolvedValue(accepted(ME.id, DANA));

    // Act & Assert
    await expect(cancelRequest(ME, DANA)).resolves.toBe('FRIENDS');
  });

  it('throws 404 for an unknown user and 403 mid-onboarding', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(cancelRequest(ME, DANA), 404, USER_NOT_FOUND);
    await expectAppError(cancelRequest(ONBOARDING, DANA), 403);
  });
});

describe('acceptRequest', () => {
  it('turns their pending request into a friendship, notifies, and returns them', async () => {
    // Arrange
    const at = new Date('2026-10-06T10:00:00.000Z');
    db.friend.updateMany.mockResolvedValue({ count: 1 });
    db.friend.findUnique.mockResolvedValue({ updatedAt: at });

    // Act
    const friend = await acceptRequest(ME, DANA);

    // Assert
    expect(db.friend.updateMany).toHaveBeenCalledWith({
      where: { requesterId: DANA, addresseeId: ME.id, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    expect(friend).toEqual({
      user: { id: DANA, displayName: 'Dana Levi', profilePictureUrl: null },
      since: '2026-10-06T10:00:00.000Z',
    });
    expect(notify.notifyFriendAccepted).toHaveBeenCalledWith({
      requesterId: DANA,
      addresseeId: ME.id,
    });
  });

  it('throws 404 "no longer available" when there is no pending request', async () => {
    // Arrange
    db.friend.updateMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(acceptRequest(ME, DANA), 404, REQUEST_GONE);
    expect(notify.notifyFriendAccepted).not.toHaveBeenCalled();
  });

  it("throws UC-7's 404 when the sender's account is gone", async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(acceptRequest(ME, DANA), 404, SENDER_GONE);
    expect(db.friend.updateMany).not.toHaveBeenCalled();
  });

  it('throws 403 mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(acceptRequest(ONBOARDING, DANA), 403);
  });
});

describe('ignoreRequest', () => {
  it('deletes only their pending request to the caller, idempotently', async () => {
    // Arrange
    db.friend.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    // Act
    await ignoreRequest(ME, DANA);
    await ignoreRequest(ME, DANA);

    // Assert: never the caller's own outgoing row, never a friendship.
    expect(db.friend.deleteMany).toHaveBeenCalledWith({
      where: { requesterId: DANA, addresseeId: ME.id, status: 'PENDING' },
    });
    expect(db.friend.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('throws 403 mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(ignoreRequest(ONBOARDING, DANA), 403);
  });
});

describe('removeFriend (unfriend.md §7)', () => {
  it('deletes only the accepted row, in either direction, and returns NONE', async () => {
    // Arrange
    db.friend.deleteMany.mockResolvedValue({ count: 1 });
    db.friend.findFirst.mockResolvedValue(null);

    // Act
    const friendship = await removeFriend(ME, DANA);

    // Assert
    expect(db.friend.deleteMany).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: ME.id, addresseeId: DANA },
          { requesterId: DANA, addresseeId: ME.id },
        ],
      },
    });
    expect(friendship).toBe('NONE');
    expect(notify.notifyFriendAccepted).not.toHaveBeenCalled();
    expect(notify.notifyFriendRequest).not.toHaveBeenCalled();
  });

  it('is idempotent and reports a pending request it left alone', async () => {
    // Arrange: not friends; they have asked the caller.
    db.friend.deleteMany.mockResolvedValue({ count: 0 });
    db.friend.findFirst
      .mockResolvedValueOnce(pending(DANA, ME.id))
      .mockResolvedValueOnce(pending(ME.id, DANA));

    // Act & Assert
    await expect(removeFriend(ME, DANA)).resolves.toBe('REQUEST_RECEIVED');
    await expect(removeFriend(ME, DANA)).resolves.toBe('REQUEST_SENT');
  });

  it('throws 404 for an unknown or mid-onboarding user, 403 mid-onboarding', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(removeFriend(ME, DANA), 404, USER_NOT_FOUND);
    await expectAppError(removeFriend(ONBOARDING, DANA), 403);
    expect(db.friend.deleteMany).not.toHaveBeenCalled();
  });
});

describe('lists and the count', () => {
  const user = (id: string, name: string) => ({
    id,
    displayName: name,
    profilePictureUrl: null,
    displayNameKey: name.toLowerCase(),
  });

  it('lists friends in either direction, alphabetically, without the name key', async () => {
    // Arrange: one row each way.
    const at = new Date('2026-10-06T10:00:00.000Z');
    db.friend.findMany.mockResolvedValue([
      {
        requesterId: ME.id,
        updatedAt: at,
        requester: user(ME.id, 'Ofri'),
        addressee: user('y', 'Yael'),
      },
      {
        requesterId: 'a',
        updatedAt: at,
        requester: user('a', 'Ada'),
        addressee: user(ME.id, 'Ofri'),
      },
    ]);

    // Act
    const friends = await listFriends(ME);

    // Assert
    expect(db.friend.findMany.mock.calls[0]![0].where).toEqual({
      status: 'ACCEPTED',
      OR: [{ requesterId: ME.id }, { addresseeId: ME.id }],
    });
    expect(friends).toEqual([
      { user: { id: 'a', displayName: 'Ada', profilePictureUrl: null }, since: at.toISOString() },
      { user: { id: 'y', displayName: 'Yael', profilePictureUrl: null }, since: at.toISOString() },
    ]);
  });

  it('lists pending requests to the caller, newest first', async () => {
    // Arrange
    const at = new Date('2026-10-06T10:00:00.000Z');
    db.friend.findMany.mockResolvedValue([
      { createdAt: at, requester: { id: DANA, displayName: 'Dana Levi', profilePictureUrl: null } },
    ]);

    // Act
    const requests = await listRequests(ME);

    // Assert
    const query = db.friend.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ addresseeId: ME.id, status: 'PENDING' });
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(requests).toEqual([
      {
        user: { id: DANA, displayName: 'Dana Levi', profilePictureUrl: null },
        since: at.toISOString(),
      },
    ]);
  });

  it('counts pending requests to the caller', async () => {
    // Arrange
    db.friend.count.mockResolvedValue(3);

    // Act & Assert
    await expect(countRequests(ME)).resolves.toBe(3);
    expect(db.friend.count).toHaveBeenCalledWith({
      where: { addresseeId: ME.id, status: 'PENDING' },
    });
  });

  it('refuses all three mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(listFriends(ONBOARDING), 403);
    await expectAppError(listRequests(ONBOARDING), 403);
    await expectAppError(countRequests(ONBOARDING), 403);
  });
});

describe('friendshipOf', () => {
  it('maps each state, in both directions, and NONE for yourself', async () => {
    // Arrange
    db.friend.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending(ME.id, DANA))
      .mockResolvedValueOnce(pending(DANA, ME.id))
      .mockResolvedValueOnce(accepted(ME.id, DANA))
      .mockResolvedValueOnce(accepted(DANA, ME.id));

    // Act
    const states = [];
    for (let i = 0; i < 5; i++) {
      states.push(await friendshipOf(ME.id, DANA));
    }
    const self = await friendshipOf(ME.id, ME.id);

    // Assert
    expect(states).toEqual(['NONE', 'REQUEST_SENT', 'REQUEST_RECEIVED', 'FRIENDS', 'FRIENDS']);
    expect(self).toBe('NONE');
    expect(db.friend.findFirst).toHaveBeenCalledTimes(5);
  });
});
