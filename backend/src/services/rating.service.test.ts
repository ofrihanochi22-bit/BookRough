import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { ALREADY_RATED } from './bookmark.service.js';
import { POST_NOT_FOUND } from './post.service.js';
import {
  editRating,
  listPostRatings,
  NOT_RATED,
  OWN_POST_RATING,
  ratePost,
  SCORE_RANGE,
} from './rating.service.js';

/**
 * Every branch of ratePost, Prisma and the notification stub mocked. The same
 * rules are proven against a real database in routes/ratings.integration.test.ts;
 * here are also the branches that cannot be reached on demand there.
 */

const { db, tx, notifyAuthorOfRating, warn } = vi.hoisted(() => {
  const tx = { rating: { create: vi.fn() }, bookmark: { deleteMany: vi.fn() } };
  return {
    tx,
    db: {
      post: { findUnique: vi.fn() },
      communityMember: { findUnique: vi.fn() },
      rating: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
    notifyAuthorOfRating: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./ratingNotification.js', () => ({ notifyAuthorOfRating }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }),
}));

const USER = { id: '11111111-1111-4111-8111-111111111111' } as User;
const AUTHOR = '44444444-4444-4444-8444-444444444444';
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const CREATED = {
  id: '55555555-5555-4555-8555-555555555555',
  postId: POST_ID,
  userId: USER.id,
  score: 8,
  comment: 'Still sounds fresh',
  createdAt: new Date('2026-10-05T10:00:00.000Z'),
};

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 'test' });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.post.findUnique.mockResolvedValue({ authorId: AUTHOR, communityId: COMMUNITY });
  db.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  tx.rating.create.mockResolvedValue(CREATED);
  tx.bookmark.deleteMany.mockResolvedValue({ count: 1 });
});

describe('ratePost', () => {
  it('saves the rating and removes your bookmark in one transaction, then notifies', async () => {
    // Act
    const rating = await ratePost(USER, POST_ID, { score: 8, comment: '  Still sounds fresh ' });

    // Assert
    expect(tx.rating.create).toHaveBeenCalledWith({
      data: { postId: POST_ID, userId: USER.id, score: 8, comment: 'Still sounds fresh' },
    });
    expect(tx.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER.id, postId: POST_ID },
    });
    expect(notifyAuthorOfRating).toHaveBeenCalledWith({
      authorId: AUTHOR,
      raterId: USER.id,
      postId: POST_ID,
      score: 8,
    });
    expect(rating).toEqual({
      id: CREATED.id,
      score: 8,
      comment: 'Still sounds fresh',
      createdAt: '2026-10-05T10:00:00.000Z',
    });
  });

  it('stores a blank or missing comment as null', async () => {
    // Act
    await ratePost(USER, POST_ID, { score: 1, comment: '   ' });
    await ratePost(USER, POST_ID, { score: 10 });

    // Assert
    expect(tx.rating.create.mock.calls.map(([args]) => args.data.comment)).toEqual([null, null]);
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 404, POST_NOT_FOUND);

    // Arrange
    db.communityMember.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 404, POST_NOT_FOUND);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('is a 403 on your own post, but a 404 first when you are no longer a member', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ authorId: USER.id, communityId: COMMUNITY });

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 403, OWN_POST_RATING);

    // Arrange
    db.communityMember.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 404, POST_NOT_FOUND);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, 11, 7.5, '7', null, undefined, Number.NaN, true])(
    'is a 422 for the score %s, saving nothing',
    async (score) => {
      // Act & Assert
      await expectAppError(ratePost(USER, POST_ID, { score }), 422, SCORE_RANGE);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it('is a 422 for a comment over 280 characters', async () => {
    // Act & Assert
    await expectAppError(
      ratePost(USER, POST_ID, { score: 5, comment: 'a'.repeat(281) }),
      422,
      'Comments can be up to 280 characters.',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('is a 409 for a second rating (unique violation), without notifying', async () => {
    // Arrange
    db.$transaction.mockRejectedValue(knownError('P2002'));

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 409, ALREADY_RATED);
    expect(notifyAuthorOfRating).not.toHaveBeenCalled();
  });

  it('is a 404 when the post is deleted between the check and the insert', async () => {
    // Arrange
    db.$transaction.mockRejectedValue(knownError('P2003'));

    // Act & Assert
    await expectAppError(ratePost(USER, POST_ID, { score: 5 }), 404, POST_NOT_FOUND);
  });

  it('passes any other database error on', async () => {
    // Arrange
    const failure = knownError('P2034');
    db.$transaction.mockRejectedValue(failure);

    // Act & Assert
    await expect(ratePost(USER, POST_ID, { score: 5 })).rejects.toBe(failure);
  });

  it('keeps the rating when the notification stub throws, and warns', async () => {
    // Arrange
    notifyAuthorOfRating.mockImplementation(() => {
      throw new Error('channel down');
    });

    // Act
    const rating = await ratePost(USER, POST_ID, { score: 8 });

    // Assert
    expect(rating.id).toBe(CREATED.id);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID }),
      'Rating notification failed',
    );
  });
});

/** A rating row as the list and the edit read it, with its rater. */
function ratingRow(id: string, userId: string, score: number, comment: string | null = null) {
  return {
    id,
    postId: POST_ID,
    userId,
    score,
    comment,
    createdAt: new Date('2026-10-05T10:00:00.000Z'),
    updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    user: { id: userId, displayName: userId === USER.id ? 'Me' : 'Noa', profilePictureUrl: null },
  };
}

describe('listPostRatings', () => {
  it('lists every rating newest first, marks yours, and summarises the same rows', async () => {
    // Arrange
    db.rating.findMany.mockResolvedValue([
      ratingRow('r2', USER.id, 6, 'nise song'),
      ratingRow('r1', AUTHOR, 9),
    ]);

    // Act
    const result = await listPostRatings(USER, POST_ID);

    // Assert
    expect(db.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: POST_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result.ratingSummary).toEqual({ average: 7.5, count: 2 });
    expect(result.ratings.map((rating) => [rating.id, rating.isMine])).toEqual([
      ['r2', true],
      ['r1', false],
    ]);
  });

  it('is empty, with no average, when nobody has rated', async () => {
    // Arrange
    db.rating.findMany.mockResolvedValue([]);

    // Act
    const result = await listPostRatings(USER, POST_ID);

    // Assert
    expect(result).toEqual({ ratingSummary: { average: null, count: 0 }, ratings: [] });
  });

  it('is a 404 for an unknown post and for a caller outside its community, reading nothing', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(listPostRatings(USER, POST_ID), 404, POST_NOT_FOUND);

    // Arrange
    db.communityMember.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(listPostRatings(USER, POST_ID), 404, POST_NOT_FOUND);
    expect(db.rating.findMany).not.toHaveBeenCalled();
  });
});

describe('editRating', () => {
  beforeEach(() => {
    db.rating.findUnique.mockResolvedValue({ id: 'r1' });
    db.rating.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...ratingRow('r1', USER.id, 6, 'nise song'), ...data }),
    );
  });

  it('changes only the keys sent, on your own rating', async () => {
    // Act
    const scoreOnly = await editRating(USER, POST_ID, { score: 9 });
    const commentOnly = await editRating(USER, POST_ID, { comment: '  nice song  ' });

    // Assert
    expect(db.rating.findUnique).toHaveBeenCalledWith({
      where: { postId_userId: { postId: POST_ID, userId: USER.id } },
      select: { id: true },
    });
    expect(db.rating.update.mock.calls.map(([args]) => args.data)).toEqual([
      { score: 9 },
      { comment: 'nice song' },
    ]);
    expect(scoreOnly).toMatchObject({ id: 'r1', score: 9, isMine: true });
    expect(commentOnly).toMatchObject({ comment: 'nice song' });
    expect(notifyAuthorOfRating).not.toHaveBeenCalled();
  });

  it('clears a blank comment to null', async () => {
    // Act
    await editRating(USER, POST_ID, { score: 7, comment: '   ' });

    // Assert
    expect(db.rating.update.mock.calls[0]![0].data).toEqual({ score: 7, comment: null });
  });

  it("is a 404 when you haven't rated the post", async () => {
    // Arrange
    db.rating.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(editRating(USER, POST_ID, { score: 9 }), 404, NOT_RATED);
    expect(db.rating.update).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange
    db.communityMember.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(editRating(USER, POST_ID, { score: 9 }), 404, POST_NOT_FOUND);
    expect(db.rating.findUnique).not.toHaveBeenCalled();
  });

  it.each([0, 11, 7.5, '7', null])('is a 422 for the score %s', async (score) => {
    // Act & Assert
    await expectAppError(editRating(USER, POST_ID, { score }), 422, SCORE_RANGE);
    expect(db.rating.update).not.toHaveBeenCalled();
  });

  it('is a 422 for a comment over 280 characters', async () => {
    // Act & Assert
    await expectAppError(
      editRating(USER, POST_ID, { comment: 'a'.repeat(281) }),
      422,
      'Comments can be up to 280 characters.',
    );
  });

  it('is a 404 when the rating disappears between the read and the write', async () => {
    // Arrange
    db.rating.update.mockRejectedValue(knownError('P2025'));

    // Act & Assert
    await expectAppError(editRating(USER, POST_ID, { score: 9 }), 404, POST_NOT_FOUND);
  });

  it('passes any other database error on', async () => {
    // Arrange
    const failure = knownError('P2034');
    db.rating.update.mockRejectedValue(failure);

    // Act & Assert
    await expect(editRating(USER, POST_ID, { score: 9 })).rejects.toBe(failure);
  });
});
