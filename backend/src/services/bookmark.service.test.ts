import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  ALREADY_RATED,
  listBookmarks,
  OWN_POST,
  removeBookmark,
  saveBookmark,
} from './bookmark.service.js';
import { encodeCursor, POST_NOT_FOUND } from './post.service.js';

/**
 * Every branch of the bookmark service, Prisma mocked. The same rules are
 * proven against a real database in routes/bookmarks.integration.test.ts;
 * here are also the branches that cannot be reached on demand there (a post
 * deleted between the check and the insert).
 */

const { db } = vi.hoisted(() => ({
  db: {
    communityMember: { findUnique: vi.fn() },
    post: { findUnique: vi.fn() },
    rating: { findUnique: vi.fn(), groupBy: vi.fn() },
    bookmark: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));

const USER = { id: '11111111-1111-4111-8111-111111111111' } as User;
const AUTHOR = '44444444-4444-4444-8444-444444444444';
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

/** A bookmark row as listBookmarks selects it. */
function row(postId: string, createdAt: Date, role: 'MEMBER' | 'ADMIN' | null = 'MEMBER') {
  return {
    createdAt,
    postId,
    post: {
      id: postId,
      authorId: AUTHOR,
      communityId: COMMUNITY,
      originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
      sourceService: 'SPOTIFY',
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
      conversionPending: false,
      createdAt,
      updatedAt: createdAt,
      author: { id: AUTHOR, displayName: 'Dana', profilePictureUrl: null },
      bookmarks: [{ userId: USER.id }],
      ratings: [],
      community: {
        id: COMMUNITY,
        name: 'Friday Jazz',
        members: role ? [{ role }] : [],
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.post.findUnique.mockResolvedValue({ authorId: AUTHOR, communityId: COMMUNITY });
  db.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  db.bookmark.createMany.mockResolvedValue({ count: 1 });
  db.bookmark.deleteMany.mockResolvedValue({ count: 1 });
  db.bookmark.findMany.mockResolvedValue([]);
  db.rating.groupBy.mockResolvedValue([]);
});

describe('saveBookmark', () => {
  it("saves a member's bookmark on someone else's post, skipping a duplicate", async () => {
    // Act
    await saveBookmark(USER, POST_ID);

    // Assert
    expect(db.bookmark.createMany).toHaveBeenCalledWith({
      data: [{ userId: USER.id, postId: POST_ID }],
      skipDuplicates: true,
    });
  });

  it('is a 403 on your own post, and saves nothing', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ authorId: USER.id, communityId: COMMUNITY });

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 403, OWN_POST);
    expect(db.bookmark.createMany).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 404, POST_NOT_FOUND);

    // Arrange
    db.communityMember.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 404, POST_NOT_FOUND);
    expect(db.bookmark.createMany).not.toHaveBeenCalled();
  });

  it('a non-member asking about their own old post still gets the 404, not the 403', async () => {
    // Arrange: the membership check comes first, so nothing is revealed.
    db.post.findUnique.mockResolvedValue({ authorId: USER.id, communityId: COMMUNITY });
    db.communityMember.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 404, POST_NOT_FOUND);
  });

  it('is a 409 on a post you already rated, and saves nothing', async () => {
    // Arrange
    db.rating.findUnique.mockResolvedValue({ id: 'rating-1' });

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 409, ALREADY_RATED);
    expect(db.rating.findUnique).toHaveBeenCalledWith({
      where: { postId_userId: { postId: POST_ID, userId: USER.id } },
      select: { id: true },
    });
    expect(db.bookmark.createMany).not.toHaveBeenCalled();
  });

  it('is a 404 when the post is deleted between the check and the insert', async () => {
    // Arrange
    db.bookmark.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );

    // Act & Assert
    await expectAppError(saveBookmark(USER, POST_ID), 404, POST_NOT_FOUND);
  });

  it('passes any other database error on', async () => {
    // Arrange
    const failure = new Error('connection lost');
    db.bookmark.createMany.mockRejectedValue(failure);

    // Act & Assert
    await expect(saveBookmark(USER, POST_ID)).rejects.toBe(failure);
  });
});

describe('removeBookmark', () => {
  it("deletes only the caller's own row, with no membership check", async () => {
    // Act
    await removeBookmark(USER, POST_ID);

    // Assert
    expect(db.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER.id, postId: POST_ID },
    });
    expect(db.communityMember.findUnique).not.toHaveBeenCalled();
  });

  it('resolves quietly when there was nothing to remove', async () => {
    // Arrange
    db.bookmark.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expect(removeBookmark(USER, POST_ID)).resolves.toBeUndefined();
  });
});

describe('listBookmarks', () => {
  it("reads only the caller's bookmarks, newest saved first, ties broken by post id", async () => {
    // Act
    await listBookmarks(USER);

    // Assert
    const query = db.bookmark.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ userId: USER.id });
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { postId: 'desc' }]);
    expect(query.take).toBe(21);
    expect(query.select.post.include.bookmarks.where).toEqual({ userId: USER.id });
    expect(query.select.post.include.community.select.members.where).toEqual({ userId: USER.id });
  });

  it('continues after a cursor without gaps or repeats', async () => {
    // Arrange
    const at = new Date('2026-10-05T10:00:00.000Z');

    // Act
    await listBookmarks(USER, encodeCursor({ createdAt: at, id: POST_ID }));

    // Assert
    expect(db.bookmark.findMany.mock.calls[0]![0].where).toEqual({
      userId: USER.id,
      OR: [{ createdAt: { lt: at } }, { createdAt: at, postId: { lt: POST_ID } }],
    });
  });

  it('gives a cursor only when there is another page, pointing at the last row shown', async () => {
    // Arrange: 21 rows means a 20-row page and more after it.
    const rows = Array.from({ length: 21 }, (_, index) =>
      row(
        `33333333-3333-4333-8333-${String(100 - index).padStart(12, '0')}`,
        new Date(Date.UTC(2026, 9, 5, 10, 0, 59 - index)),
      ),
    );
    db.bookmark.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows.slice(0, 3));

    // Act
    const full = await listBookmarks(USER);
    const last = await listBookmarks(USER);

    // Assert
    expect(full.items).toHaveLength(20);
    expect(full.nextCursor).toBe(
      encodeCursor({ createdAt: rows[19]!.createdAt, id: rows[19]!.postId }),
    );
    expect(last.items).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
  });

  it('marks posts from a community you left, and computes canDelete from your role today', async () => {
    // Arrange
    const at = new Date('2026-10-05T10:00:00.000Z');
    db.bookmark.findMany.mockResolvedValue([
      row(POST_ID, at, null),
      row('55555555-5555-4555-8555-555555555555', at, 'ADMIN'),
      row('66666666-6666-4666-8666-666666666666', at, 'MEMBER'),
    ]);

    // Act
    const { items } = await listBookmarks(USER);

    // Assert
    expect(items.map((item) => [item.isMember, item.post.canDelete])).toEqual([
      [false, false],
      [true, true],
      [true, false],
    ]);
    expect(items[0]!.post.isBookmarked).toBe(true);
  });

  it('is a 422 for a malformed cursor, before any query', async () => {
    // Act & Assert
    await expectAppError(listBookmarks(USER, 'not-a-cursor'), 422);
    expect(db.bookmark.findMany).not.toHaveBeenCalled();
  });
});
