import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '@prisma/client';

import {
  areFriends,
  friendshipsWith,
  friendsOnPosts,
  lockFriendship,
  relation,
} from './friendship.js';

const { db } = vi.hoisted(() => ({
  db: { friend: { count: vi.fn(), findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock('../db/prisma.js', () => ({ prisma: db }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('areFriends', () => {
  it('looks for an accepted row in either direction', async () => {
    // Arrange
    db.friend.count.mockResolvedValue(1);

    // Act
    const friends = await areFriends('a', 'b');

    // Assert
    expect(friends).toBe(true);
    expect(db.friend.count).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: 'a', addresseeId: 'b' },
          { requesterId: 'b', addresseeId: 'a' },
        ],
      },
    });
  });

  it('is false with no row', async () => {
    // Arrange
    db.friend.count.mockResolvedValue(0);

    // Act & Assert
    await expect(areFriends('a', 'b')).resolves.toBe(false);
  });
});

describe('lockFriendship', () => {
  const tx = db as unknown as Prisma.TransactionClient;

  it('is true when the row is there to lock, and false otherwise', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValueOnce([{}]).mockResolvedValueOnce([]);

    // Act & Assert
    await expect(lockFriendship(tx, 'a', 'b')).resolves.toBe(true);
    await expect(lockFriendship(tx, 'a', 'b')).resolves.toBe(false);
  });
});

describe('friendsOnPosts', () => {
  it('runs no query for a page with no direct item', async () => {
    // Act
    const friends = await friendsOnPosts('me', [{ authorId: 'other', recipientId: null }]);

    // Assert
    expect(friends.size).toBe(0);
    expect(db.friend.findMany).not.toHaveBeenCalled();
  });

  it('asks about the other person on each item, once, and returns who is a friend', async () => {
    // Arrange
    db.friend.findMany.mockResolvedValue([
      { requesterId: 'me', addresseeId: 'noam' },
      { requesterId: 'yael', addresseeId: 'me' },
    ]);

    // Act
    const friends = await friendsOnPosts('me', [
      { authorId: 'me', recipientId: 'noam' },
      { authorId: 'yael', recipientId: 'me' },
      { authorId: 'zed', recipientId: 'me' },
    ]);

    // Assert
    expect(db.friend.findMany).toHaveBeenCalledTimes(1);
    expect([...friends].sort()).toEqual(['noam', 'yael']);
  });
});

describe('relation', () => {
  it("reads a row from the viewer's side", () => {
    // Act & Assert
    expect(relation(null, 'me')).toBe('NONE');
    expect(relation({ requesterId: 'me', addresseeId: 'x', status: 'PENDING' }, 'me')).toBe(
      'REQUEST_SENT',
    );
    expect(relation({ requesterId: 'x', addresseeId: 'me', status: 'PENDING' }, 'me')).toBe(
      'REQUEST_RECEIVED',
    );
    expect(relation({ requesterId: 'x', addresseeId: 'me', status: 'ACCEPTED' }, 'me')).toBe(
      'FRIENDS',
    );
    expect(relation({ requesterId: 'me', addresseeId: 'x', status: 'ACCEPTED' }, 'me')).toBe(
      'FRIENDS',
    );
  });
});

describe('friendshipsWith', () => {
  it('runs no query for an empty list, or for the viewer alone', async () => {
    // Act
    const none = await friendshipsWith('me', []);
    const self = await friendshipsWith('me', ['me']);

    // Assert
    expect(none.size).toBe(0);
    expect(self.size).toBe(0);
    expect(db.friend.findMany).not.toHaveBeenCalled();
  });

  it("maps each row in either direction to the viewer's relation; no row is absent", async () => {
    // Arrange
    db.friend.findMany.mockResolvedValue([
      { requesterId: 'me', addresseeId: 'sent', status: 'PENDING' },
      { requesterId: 'asked', addresseeId: 'me', status: 'PENDING' },
      { requesterId: 'friend', addresseeId: 'me', status: 'ACCEPTED' },
    ]);

    // Act
    const map = await friendshipsWith('me', ['me', 'sent', 'asked', 'friend', 'stranger']);

    // Assert
    expect(Object.fromEntries(map)).toEqual({
      sent: 'REQUEST_SENT',
      asked: 'REQUEST_RECEIVED',
      friend: 'FRIENDS',
    });
    const others = ['sent', 'asked', 'friend', 'stranger'];
    expect(db.friend.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { requesterId: 'me', addresseeId: { in: others } },
          { addresseeId: 'me', requesterId: { in: others } },
        ],
      },
      select: { requesterId: true, addresseeId: true, status: true },
    });
  });
});
