import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { encodeCursor, PAGE_SIZE } from '../utils/cursor.js';
import {
  countUnread,
  listNotifications,
  markAllRead,
  markRead,
  NOTIFICATION_NOT_FOUND,
  notifyCommunityPost,
  notifyFriendAccepted,
  notifyFriendRequest,
  notifyInvitations,
  notifyRating,
  notifyRecommendation,
} from './notification.service.js';

/**
 * Unit tests: the Prisma calls each function makes and the branches around
 * them. The SQL itself — grouping, the partial index, visibility joins and
 * cascades — runs against Postgres in routes/notifications.integration.test.ts.
 */

const { db, warn } = vi.hoisted(() => ({
  db: {
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    rating: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
  },
  warn: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }),
}));

const ME = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ofri',
  preferredService: 'SPOTIFY',
} as User;
const ONBOARDING = { id: ME.id, displayName: null, preferredService: null } as unknown as User;
const DANA = '22222222-2222-4222-8222-222222222222';
const COMMUNITY = '33333333-3333-4333-8333-333333333333';
const POST = '44444444-4444-4444-8444-444444444444';
const NOTE = '55555555-5555-4555-8555-555555555555';
const AT = new Date('2026-11-08T10:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE,
    userId: ME.id,
    type: 'FRIEND_REQUEST',
    actorId: DANA,
    communityId: null,
    postId: null,
    count: 1,
    createdAt: AT,
    updatedAt: AT,
    readAt: null,
    actor: { id: DANA, displayName: 'Dana', profilePictureUrl: null },
    community: null,
    post: null,
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.rating.findMany.mockResolvedValue([]);
});

describe('writers', () => {
  it('notifyCommunityPost fans out in one statement, excluding the author', async () => {
    // Act
    await notifyCommunityPost({ communityId: COMMUNITY, authorId: DANA });

    // Assert
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [sql] = db.$executeRaw.mock.calls[0] as [{ sql: string; values: unknown[] }];
    expect(sql.sql).toContain('ON CONFLICT (user_id, community_id)');
    expect(sql.sql).toContain('m.user_id <>');
    expect(sql.values).toEqual([DANA, COMMUNITY, COMMUNITY, DANA]);
  });

  it('notifyRecommendation writes a RECOMMENDATION for the recipient', async () => {
    // Act
    await notifyRecommendation({ senderId: DANA, recipientId: ME.id, postId: POST });

    // Assert
    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: ME.id, type: 'RECOMMENDATION', actorId: DANA, postId: POST },
    });
  });

  it('notifyRating writes a RATING for the author', async () => {
    // Act
    await notifyRating({ authorId: ME.id, raterId: DANA, postId: POST });

    // Assert
    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: ME.id, type: 'RATING', actorId: DANA, postId: POST },
    });
  });

  it('notifyRating writes nothing for your own rating', async () => {
    // Act
    await notifyRating({ authorId: ME.id, raterId: ME.id, postId: POST });

    // Assert
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('notifyFriendRequest creates a row when there is no unread one from that sender', async () => {
    // Arrange
    db.notification.updateMany.mockResolvedValue({ count: 0 });

    // Act
    await notifyFriendRequest({ requesterId: DANA, addresseeId: ME.id });

    // Assert
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: ME.id, type: 'FRIEND_REQUEST', actorId: DANA, readAt: null },
      data: { updatedAt: expect.any(Date) },
    });
    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: ME.id, type: 'FRIEND_REQUEST', actorId: DANA },
    });
  });

  it('notifyFriendRequest refreshes an unread row instead of stacking another', async () => {
    // Arrange
    db.notification.updateMany.mockResolvedValue({ count: 1 });

    // Act
    await notifyFriendRequest({ requesterId: DANA, addresseeId: ME.id });

    // Assert
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('notifyFriendAccepted tells the original requester', async () => {
    // Act
    await notifyFriendAccepted({ requesterId: ME.id, addresseeId: DANA });

    // Assert
    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: ME.id, type: 'FRIEND_ACCEPTED', actorId: DANA },
    });
  });

  it('notifyInvitations writes one COMMUNITY_INVITATION per invitee', async () => {
    // Act
    await notifyInvitations({ communityId: COMMUNITY, invitedById: DANA, userIds: [ME.id] });

    // Assert
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: ME.id, type: 'COMMUNITY_INVITATION', actorId: DANA, communityId: COMMUNITY },
      ],
    });
  });

  it('a failing write is caught and warned about, never thrown', async () => {
    // Arrange
    db.notification.create.mockRejectedValue(new Error('database down'));
    db.$executeRaw.mockRejectedValue(new Error('database down'));

    // Act & Assert
    await expect(
      notifyRating({ authorId: ME.id, raterId: DANA, postId: POST }),
    ).resolves.toBeUndefined();
    await expect(
      notifyCommunityPost({ communityId: COMMUNITY, authorId: DANA }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'rating' }),
      'Notification write failed',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'communityPost' }),
      'Notification write failed',
    );
  });
});

describe('listNotifications', () => {
  it('reads the caller’s visible rows, newest activity first, and maps them field by field', async () => {
    // Arrange
    db.notification.findMany.mockResolvedValue([
      row({
        type: 'COMMUNITY_POSTS',
        communityId: COMMUNITY,
        count: 3,
        community: { id: COMMUNITY, name: 'Friday Jazz' },
      }),
    ]);

    // Act
    const page = await listNotifications(ME);

    // Assert
    const call = db.notification.findMany.mock.calls[0]![0] as {
      where: { AND: { userId: string; OR: unknown[] }[] };
      orderBy: unknown;
      take: number;
    };
    expect(call.where.AND[0]!.userId).toBe(ME.id);
    expect(call.where.AND[0]!.OR).toHaveLength(4);
    expect(call.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    expect(call.take).toBe(PAGE_SIZE + 1);
    expect(page).toEqual({
      items: [
        {
          id: NOTE,
          type: 'COMMUNITY_POSTS',
          at: AT.toISOString(),
          read: false,
          actor: { id: DANA, displayName: 'Dana', profilePictureUrl: null },
          community: { id: COMMUNITY, name: 'Friday Jazz' },
          post: null,
          count: 3,
          score: null,
        },
      ],
      nextCursor: null,
    });
    expect(page.items[0]).not.toHaveProperty('userId');
  });

  it('gives a RATING the rater’s current score, and null when the rating is gone', async () => {
    // Arrange
    const OTHER_POST = '66666666-6666-4666-8666-666666666666';
    db.notification.findMany.mockResolvedValue([
      row({ type: 'RATING', postId: POST, post: { id: POST, songTitle: 'Blue' } }),
      row({
        id: 'n2',
        type: 'RATING',
        postId: OTHER_POST,
        post: { id: OTHER_POST, songTitle: null },
      }),
    ]);
    db.rating.findMany.mockResolvedValue([{ postId: POST, userId: DANA, score: 9 }]);

    // Act
    const page = await listNotifications(ME);

    // Assert
    expect(db.rating.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { postId: POST, userId: DANA },
          { postId: OTHER_POST, userId: DANA },
        ],
      },
      select: { postId: true, userId: true, score: true },
    });
    expect(page.items.map((item) => item.score)).toEqual([9, null]);
    expect(page.items[0]!.post).toEqual({ id: POST, title: 'Blue' });
  });

  it('skips the score lookup when the page has no ratings', async () => {
    // Arrange
    db.notification.findMany.mockResolvedValue([row()]);

    // Act
    await listNotifications(ME);

    // Assert
    expect(db.rating.findMany).not.toHaveBeenCalled();
  });

  it('pages with a cursor on (updatedAt, id)', async () => {
    // Arrange
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      row({ id: `n${index}`, updatedAt: new Date(AT.getTime() - index * 1000) }),
    );
    db.notification.findMany.mockResolvedValue(rows);
    const cursor = encodeCursor({ createdAt: AT, id: NOTE });

    // Act
    const page = await listNotifications(ME, cursor);

    // Assert
    const call = db.notification.findMany.mock.calls[0]![0] as { where: { AND: unknown[] } };
    expect(call.where.AND[1]).toEqual({
      OR: [{ updatedAt: { lt: AT } }, { updatedAt: AT, id: { lt: NOTE } }],
    });
    expect(page.items).toHaveLength(PAGE_SIZE);
    const last = rows[PAGE_SIZE - 1]!;
    expect(page.nextCursor).toBe(encodeCursor({ createdAt: last.updatedAt, id: last.id }));
  });

  it('refuses a malformed cursor with 422, and a caller mid-onboarding with 403', async () => {
    // Act & Assert
    await expectAppError(listNotifications(ME, 'not-a-cursor'), 422);
    await expectAppError(listNotifications(ONBOARDING), 403, 'Finish your profile first.');
    expect(db.notification.findMany).not.toHaveBeenCalled();
  });
});

describe('countUnread', () => {
  it('counts visible unread rows', async () => {
    // Arrange
    db.notification.count.mockResolvedValue(4);

    // Act
    const count = await countUnread(ME);

    // Assert
    expect(count).toBe(4);
    const call = db.notification.count.mock.calls[0]![0] as { where: { AND: unknown[] } };
    expect(call.where.AND[1]).toEqual({ readAt: null });
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(countUnread(ONBOARDING), 403);
  });
});

describe('markRead', () => {
  it('reads the caller’s own visible row and returns it read', async () => {
    // Arrange
    db.notification.updateMany.mockResolvedValue({ count: 1 });
    db.notification.findFirst.mockResolvedValue(row({ readAt: AT }));

    // Act
    const item = await markRead(ME, NOTE);

    // Assert
    const update = db.notification.updateMany.mock.calls[0]![0] as {
      where: { AND: [{ userId: string }, unknown] };
    };
    expect(update.where.AND[0].userId).toBe(ME.id);
    expect(update.where.AND[1]).toEqual({ id: NOTE, readAt: null });
    expect(item.read).toBe(true);
  });

  it('is idempotent: an already-read row comes back unchanged', async () => {
    // Arrange
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    db.notification.findFirst.mockResolvedValue(row({ readAt: AT }));

    // Act & Assert
    await expect(markRead(ME, NOTE)).resolves.toMatchObject({ id: NOTE, read: true });
  });

  it('is a 404 for someone else’s row, a missing one, or one the caller can no longer see', async () => {
    // Arrange: every one of these reads back as nothing for this caller.
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    db.notification.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(markRead(ME, NOTE), 404, NOTIFICATION_NOT_FOUND);
  });

  it('refuses a caller mid-onboarding before touching anything', async () => {
    // Act & Assert
    await expectAppError(markRead(ONBOARDING, NOTE), 403);
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('markAllRead', () => {
  it('reads every unread row of the caller', async () => {
    // Arrange
    db.notification.updateMany.mockResolvedValue({ count: 3 });

    // Act
    await markAllRead(ME);

    // Assert
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: ME.id, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(markAllRead(ONBOARDING), 403);
  });
});
