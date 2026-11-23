import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { encodeCursor, PAGE_SIZE } from '../utils/cursor.js';
import {
  countUnchecked,
  listUnchecked,
  markChecked,
  recordCheck,
  unmarkChecked,
} from './communityChecks.service.js';

/**
 * Every branch of the From communities service, Prisma mocked. The SQL rule
 * itself is proven against a real database in
 * routes/communityChecks.integration.test.ts.
 */

const { db } = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    post: { findUnique: vi.fn(), findMany: vi.fn() },
    communityMember: { findUnique: vi.fn() },
    rating: { groupBy: vi.fn() },
    communityPostCheck: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock('../db/prisma.js', () => ({ prisma: db }));

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Dana',
  preferredService: 'SPOTIFY',
} as User;
const NOT_ONBOARDED = { ...USER, displayName: null, preferredService: null } as User;
const AUTHOR = '44444444-4444-4444-8444-444444444444';
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';

async function expectAppError(promise: Promise<unknown>, statusCode: number) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode });
}

function postRow(id: string, createdAt: Date, role: 'MEMBER' | 'ADMIN' = 'MEMBER') {
  return {
    id,
    authorId: AUTHOR,
    communityId: COMMUNITY,
    recipientId: null,
    originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    sourceService: 'SPOTIFY',
    linkPlatform: null,
    kind: 'TRACK',
    songTitle: 'Song',
    songArtist: 'Band',
    songCoverArtUrl: null,
    universalLinkSpotify: null,
    universalLinkApple: null,
    universalLinkYoutube: null,
    universalLinkTidal: null,
    universalLinkDeezer: null,
    textComment: null,
    commentEditedAt: null,
    conversionPending: false,
    createdAt,
    updatedAt: createdAt,
    author: { id: AUTHOR, displayName: 'Noam', profilePictureUrl: null },
    recipient: null,
    bookmarks: [],
    ratings: [],
    _count: { comments: 0 },
    community: { id: COMMUNITY, name: 'Friday Jazz', members: [{ role }] },
  };
}

function uuid(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
}

beforeEach(() => {
  vi.resetAllMocks();
  db.post.findUnique.mockResolvedValue({
    authorId: AUTHOR,
    communityId: COMMUNITY,
    recipientId: null,
  });
  db.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  db.rating.groupBy.mockResolvedValue([]);
  db.communityPostCheck.createMany.mockResolvedValue({ count: 1 });
  db.communityPostCheck.deleteMany.mockResolvedValue({ count: 1 });
});

describe('listUnchecked', () => {
  it("returns the SQL's order with each community, skipping a post deleted meanwhile", async () => {
    // Arrange
    const newer = uuid(1);
    const gone = uuid(2);
    const older = uuid(3);
    db.$queryRaw.mockResolvedValue([{ id: newer }, { id: gone }, { id: older }]);
    db.post.findMany.mockResolvedValue([
      postRow(older, new Date('2026-11-22T10:00:00Z')),
      postRow(newer, new Date('2026-11-22T11:00:00Z'), 'ADMIN'),
    ]);

    // Act
    const page = await listUnchecked(USER);

    // Assert
    expect(page.items.map((item) => item.post.id)).toEqual([newer, older]);
    expect(page.items[0]?.community).toEqual({ id: COMMUNITY, name: 'Friday Jazz' });
    expect(page.items[0]?.post.canDelete).toBe(true);
    expect(page.items[1]?.post.canDelete).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('gives a cursor when there is one more than a page', async () => {
    // Arrange
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      postRow(uuid(index), new Date(Date.UTC(2026, 10, 22, 0, 0, PAGE_SIZE - index))),
    );
    db.$queryRaw.mockResolvedValue(rows.map((row) => ({ id: row.id })));
    db.post.findMany.mockResolvedValue(rows.slice(0, PAGE_SIZE));

    // Act
    const page = await listUnchecked(USER, encodeCursor(rows[0]!));

    // Assert
    expect(page.items).toHaveLength(PAGE_SIZE);
    expect(page.nextCursor).toBe(encodeCursor(rows[PAGE_SIZE - 1]!));
  });

  it('422 for a malformed cursor, before any query', async () => {
    // Act & Assert
    await expectAppError(listUnchecked(USER, 'nope'), 422);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('403 before onboarding', async () => {
    // Act & Assert
    await expectAppError(listUnchecked(NOT_ONBOARDED), 403);
  });
});

describe('countUnchecked', () => {
  it("turns Postgres's bigint into a number", async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([{ count: 4n }]);

    // Act & Assert
    expect(await countUnchecked(USER)).toBe(4);
  });

  it('403 before onboarding', async () => {
    // Act & Assert
    await expectAppError(countUnchecked(NOT_ONBOARDED), 403);
  });
});

describe('recordCheck', () => {
  it("writes a check for someone else's community post", async () => {
    // Act
    await recordCheck(db as never, USER.id, { scope: 'COMMUNITY', authorId: AUTHOR }, POST_ID);

    // Assert
    expect(db.communityPostCheck.createMany).toHaveBeenCalledWith({
      data: [{ userId: USER.id, postId: POST_ID }],
      skipDuplicates: true,
    });
  });

  it('writes nothing for a direct recommendation or the caller’s own post', async () => {
    // Act
    await recordCheck(db as never, USER.id, { scope: 'DIRECT', authorId: AUTHOR }, POST_ID);
    await recordCheck(db as never, USER.id, { scope: 'COMMUNITY', authorId: USER.id }, POST_ID);

    // Assert
    expect(db.communityPostCheck.createMany).not.toHaveBeenCalled();
  });
});

describe('markChecked', () => {
  it('writes the check', async () => {
    // Act
    await markChecked(USER, POST_ID);

    // Assert
    expect(db.communityPostCheck.createMany).toHaveBeenCalledTimes(1);
  });

  it('404 for a direct recommendation', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      communityId: null,
      recipientId: USER.id,
    });

    // Act & Assert
    await expectAppError(markChecked(USER, POST_ID), 404);
    expect(db.communityPostCheck.createMany).not.toHaveBeenCalled();
  });

  it('404 for a missing post or a non-member', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(markChecked(USER, POST_ID), 404);
    db.communityMember.findUnique.mockResolvedValueOnce(null);
    await expectAppError(markChecked(USER, POST_ID), 404);
  });

  it('404 when the post is deleted between the access check and the insert', async () => {
    // Arrange
    db.communityPostCheck.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );

    // Act & Assert
    await expectAppError(markChecked(USER, POST_ID), 404);
  });

  it('rethrows any other database error', async () => {
    // Arrange
    const failure = new Error('connection lost');
    db.communityPostCheck.createMany.mockRejectedValue(failure);

    // Act & Assert
    await expect(markChecked(USER, POST_ID)).rejects.toBe(failure);
  });

  it('403 before onboarding', async () => {
    // Act & Assert
    await expectAppError(markChecked(NOT_ONBOARDED, POST_ID), 403);
  });
});

describe('unmarkChecked', () => {
  it("deletes only the caller's own row", async () => {
    // Act
    await unmarkChecked(USER, POST_ID);

    // Assert
    expect(db.communityPostCheck.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER.id, postId: POST_ID },
    });
  });

  it('404 for a direct recommendation, and 403 before onboarding', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      communityId: null,
      recipientId: USER.id,
    });

    // Act & Assert
    await expectAppError(unmarkChecked(USER, POST_ID), 404);
    await expectAppError(unmarkChecked(NOT_ONBOARDED, POST_ID), 403);
    expect(db.communityPostCheck.deleteMany).not.toHaveBeenCalled();
  });
});
