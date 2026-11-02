import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '@prisma/client';

import { areFriends, friendsOnPosts, lockFriendship } from './friendship.js';

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
