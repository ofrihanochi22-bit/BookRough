import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  COMMENT_MESSAGES,
  createComment,
  deleteComment,
  editComment,
  listComments,
} from './comment.service.js';
import { DISCUSSION_MESSAGES } from './postText.js';

/**
 * Every branch of the discussion service (docs/features/discussion-threads.md
 * §7), with Prisma, post access, friendship and the notification writer
 * mocked. The same rules run against Postgres in
 * routes/comments.integration.test.ts.
 */

const { db, tx, requirePostAccess, areFriends, notifyCommentReply, requireOnboarded } = vi.hoisted(
  () => {
    const tx = {
      comment: { count: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    return {
      tx,
      db: {
        comment: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        rating: { findFirst: vi.fn() },
        $transaction: vi.fn(),
      },
      requirePostAccess: vi.fn(),
      areFriends: vi.fn(),
      notifyCommentReply: vi.fn(),
      requireOnboarded: vi.fn(),
    };
  },
);

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./postAccess.js', () => ({ requirePostAccess }));
vi.mock('./friendship.js', () => ({ areFriends }));
vi.mock('./notification.service.js', () => ({ notifyCommentReply }));
vi.mock('./profile.service.js', () => ({ requireOnboarded }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const ME = { id: '11111111-1111-4111-8111-111111111111' } as User;
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const DANA = '33333333-3333-4333-8333-333333333333';
const POST = '44444444-4444-4444-8444-444444444444';
const COMMUNITY = '55555555-5555-4555-8555-555555555555';
const RATING = '66666666-6666-4666-8666-666666666666';
const PARENT = '77777777-7777-4777-8777-777777777777';
const COMMENT = '88888888-8888-4888-8888-888888888888';

const MEMBER = { scope: 'COMMUNITY', authorId: AUTHOR, communityId: COMMUNITY, role: 'MEMBER' };
const ADMIN = { ...MEMBER, role: 'ADMIN' };
const DIRECT = { scope: 'DIRECT', authorId: AUTHOR, recipientId: ME.id, isRecipient: true };

function person(id: string) {
  return { id, displayName: `user-${id.slice(0, 4)}`, profilePictureUrl: null };
}

function row(overrides: Record<string, unknown> = {}) {
  const authorId = (overrides.authorId as string | undefined) ?? ME.id;
  return {
    id: COMMENT,
    postId: POST,
    authorId,
    ratingId: null,
    parentId: null,
    replyToId: null,
    body: 'Love this one',
    createdAt: new Date('2026-11-09T10:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: person(authorId),
    replyTo: null,
    ...overrides,
  };
}

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
  requirePostAccess.mockResolvedValue(MEMBER);
  areFriends.mockResolvedValue(true);
  db.comment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(row(data)),
  );
  db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
});

describe('listComments', () => {
  it('lists the whole discussion oldest first, marking yours and hiding deleted text', async () => {
    // Arrange
    db.comment.findMany.mockResolvedValue([
      row(),
      row({ id: PARENT, authorId: DANA, body: null, deletedAt: new Date() }),
    ]);

    // Act
    const comments = await listComments(ME, POST);

    // Assert
    expect(db.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: POST },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(comments[0]).toMatchObject({ isMine: true, canDelete: true, deleted: false });
    expect(comments[1]).toMatchObject({ body: null, deleted: true, canDelete: false });
  });

  it("lets an admin delete anyone's comment", async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(ADMIN);
    db.comment.findMany.mockResolvedValue([row({ authorId: DANA })]);

    // Act
    const [comment] = await listComments(ME, POST);

    // Assert
    expect(comment).toMatchObject({ isMine: false, canDelete: true });
  });

  it('is the 404 of post access for an outsider, reading nothing', async () => {
    // Arrange
    requirePostAccess.mockRejectedValue(new AppError('Post not found.', 404));

    // Act + Assert
    await expectAppError(listComments(ME, POST), 404);
    expect(db.comment.findMany).not.toHaveBeenCalled();
  });

  it('is a 403 before onboarding', async () => {
    // Arrange
    requireOnboarded.mockImplementation(() => {
      throw new AppError('Finish your profile first.', 403);
    });

    // Act + Assert
    await expectAppError(listComments(ME, POST), 403);
  });
});

describe('createComment', () => {
  it('posts a top-level comment, answering nobody, and tells the post author', async () => {
    // Act
    const comment = await createComment(ME, POST, { body: '  Love this one ' });

    // Assert
    expect(db.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          postId: POST,
          authorId: ME.id,
          body: 'Love this one',
          ratingId: null,
          parentId: null,
          replyToId: null,
        },
      }),
    );
    expect(notifyCommentReply).toHaveBeenCalledWith({
      postId: POST,
      readerId: AUTHOR,
      actorId: ME.id,
    });
    expect(comment).toMatchObject({ body: 'Love this one', isMine: true });
  });

  it("replies under a review and tells the review's author", async () => {
    // Arrange
    db.rating.findFirst.mockResolvedValue({ userId: DANA });

    // Act
    await createComment(ME, POST, { body: 'Agreed', ratingId: RATING });

    // Assert
    expect(db.rating.findFirst).toHaveBeenCalledWith({
      where: { id: RATING, postId: POST, comment: { not: null } },
      select: { userId: true },
    });
    expect(db.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ratingId: RATING, parentId: null, replyToId: DANA }),
      }),
    );
    expect(notifyCommentReply).toHaveBeenCalledWith({
      postId: POST,
      readerId: DANA,
      actorId: ME.id,
    });
  });

  it('replies to someone already in a thread, who is the one told', async () => {
    // Arrange
    db.comment.findFirst
      .mockResolvedValueOnce({ authorId: AUTHOR })
      .mockResolvedValueOnce({ id: COMMENT });

    // Act
    await createComment(ME, POST, { body: 'Yes', parentId: PARENT, replyToId: DANA });

    // Assert
    expect(db.comment.findFirst).toHaveBeenLastCalledWith({
      where: { postId: POST, authorId: DANA, parentId: PARENT },
      select: { id: true },
    });
    expect(notifyCommentReply).toHaveBeenCalledWith({
      postId: POST,
      readerId: DANA,
      actorId: ME.id,
    });
  });

  it("answers the opener's author when the named person is not in the thread", async () => {
    // Arrange
    db.comment.findFirst.mockResolvedValueOnce({ authorId: AUTHOR }).mockResolvedValueOnce(null);

    // Act
    await createComment(ME, POST, { body: 'Yes', parentId: PARENT, replyToId: DANA });

    // Assert
    expect(db.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replyToId: AUTHOR }) }),
    );
    expect(notifyCommentReply).toHaveBeenCalledWith({
      postId: POST,
      readerId: AUTHOR,
      actorId: ME.id,
    });
  });

  it('is a 404 under a rating without a review, or a missing, deleted or nested parent', async () => {
    // Arrange
    db.rating.findFirst.mockResolvedValue(null);
    db.comment.findFirst.mockResolvedValue(null);

    // Act + Assert
    await expectAppError(
      createComment(ME, POST, { body: 'Hi', ratingId: RATING }),
      404,
      COMMENT_MESSAGES.gone,
    );
    await expectAppError(
      createComment(ME, POST, { body: 'Hi', parentId: PARENT }),
      404,
      COMMENT_MESSAGES.gone,
    );
    expect(db.comment.findFirst).toHaveBeenCalledWith({
      where: { id: PARENT, postId: POST, ratingId: null, parentId: null, deletedAt: null },
      select: { authorId: true },
    });
    expect(db.comment.create).not.toHaveBeenCalled();
  });

  it('is a 422 for a reply naming two threads', async () => {
    // Act + Assert
    await expectAppError(
      createComment(ME, POST, { body: 'Hi', ratingId: RATING, parentId: PARENT }),
      422,
      COMMENT_MESSAGES.oneThread,
    );
  });

  it('is a 422 for an empty body or one over 500 characters, before reading the post', async () => {
    // Act + Assert
    await expectAppError(createComment(ME, POST, { body: '   ' }), 422, DISCUSSION_MESSAGES.empty);
    await expectAppError(
      createComment(ME, POST, { body: 'a'.repeat(501) }),
      422,
      DISCUSSION_MESSAGES.length,
    );
    expect(requirePostAccess).not.toHaveBeenCalled();
  });

  it('is a 403 on a direct item once you are no longer friends', async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(DIRECT);
    areFriends.mockResolvedValue(false);

    // Act + Assert
    await expectAppError(
      createComment(ME, POST, { body: 'Hi' }),
      403,
      COMMENT_MESSAGES.friendsOnly,
    );
    expect(areFriends).toHaveBeenCalledWith(ME.id, AUTHOR);
  });

  it('is a 404 when the thread or post is deleted between the check and the insert', async () => {
    // Arrange
    db.comment.create.mockRejectedValue(knownError('P2003'));

    // Act + Assert
    await expectAppError(createComment(ME, POST, { body: 'Hi' }), 404, COMMENT_MESSAGES.gone);
    expect(notifyCommentReply).not.toHaveBeenCalled();
  });

  it('passes any other database error on', async () => {
    // Arrange
    db.comment.create.mockRejectedValue(knownError('P1001'));

    // Act + Assert
    await expect(createComment(ME, POST, { body: 'Hi' })).rejects.toMatchObject({
      code: 'P1001',
    });
  });
});

describe('editComment', () => {
  it('changes your comment and marks it edited', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());
    db.comment.update.mockResolvedValue(row({ body: 'Even better', editedAt: new Date() }));

    // Act
    const comment = await editComment(ME, COMMENT, ' Even better ');

    // Assert
    expect(db.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COMMENT },
        data: { body: 'Even better', editedAt: expect.any(Date) as Date },
      }),
    );
    expect(comment.editedAt).not.toBeNull();
  });

  it('writes nothing when the body is unchanged', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());

    // Act
    const comment = await editComment(ME, COMMENT, 'Love this one');

    // Assert
    expect(db.comment.update).not.toHaveBeenCalled();
    expect(comment.editedAt).toBeNull();
  });

  it("is a 403 on someone else's comment, even for an admin", async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(ADMIN);
    db.comment.findUnique.mockResolvedValue(row({ authorId: DANA }));

    // Act + Assert
    await expectAppError(editComment(ME, COMMENT, 'Mine now'), 403, COMMENT_MESSAGES.authorOnly);
  });

  it('is a 404 for a missing or deleted comment', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValueOnce(null);
    db.comment.findUnique.mockResolvedValueOnce(row({ body: null, deletedAt: new Date() }));

    // Act + Assert
    await expectAppError(editComment(ME, COMMENT, 'Hi'), 404, COMMENT_MESSAGES.notFound);
    await expectAppError(editComment(ME, COMMENT, 'Hi'), 404, COMMENT_MESSAGES.notFound);
  });

  it('is the same 404 when the post is out of reach, whatever access says', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());
    requirePostAccess.mockRejectedValueOnce(new AppError('Post not found.', 404));
    requirePostAccess.mockRejectedValueOnce(new AppError('Not allowed.', 403));

    // Act + Assert
    await expectAppError(editComment(ME, COMMENT, 'Hi'), 404, COMMENT_MESSAGES.notFound);
    await expectAppError(editComment(ME, COMMENT, 'Hi'), 404, COMMENT_MESSAGES.notFound);
  });

  it('passes on an unexpected access failure', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());
    requirePostAccess.mockRejectedValue(new Error('boom'));

    // Act + Assert
    await expect(editComment(ME, COMMENT, 'Hi')).rejects.toThrow('boom');
  });

  it('is a 403 on a direct item once you are no longer friends', async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(DIRECT);
    areFriends.mockResolvedValue(false);
    db.comment.findUnique.mockResolvedValue(row());

    // Act + Assert
    await expectAppError(editComment(ME, COMMENT, 'Hi'), 403, COMMENT_MESSAGES.friendsOnly);
  });

  it('is a 422 for an empty body', async () => {
    // Act + Assert
    await expectAppError(editComment(ME, COMMENT, ''), 422, DISCUSSION_MESSAGES.empty);
  });
});

describe('deleteComment', () => {
  it('removes a reply, locking its thread, and keeps a live opener', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row({ parentId: PARENT }));
    tx.comment.count.mockResolvedValue(0);

    // Act
    const result = await deleteComment(ME, COMMENT);

    // Assert
    expect(result).toEqual({ deleted: 'removed' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: COMMENT } });
    // Only a hidden opener goes with its last reply.
    expect(tx.comment.deleteMany).toHaveBeenCalledWith({
      where: { id: PARENT, deletedAt: { not: null } },
    });
  });

  it('keeps the opener while other replies remain', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row({ parentId: PARENT }));
    tx.comment.count.mockResolvedValue(2);

    // Act
    await deleteComment(ME, COMMENT);

    // Assert
    expect(tx.comment.deleteMany).not.toHaveBeenCalled();
  });

  it('hides a post comment that has replies, keeping its thread', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());
    tx.comment.count.mockResolvedValue(1);

    // Act
    const result = await deleteComment(ME, COMMENT);

    // Assert
    expect(result).toEqual({ deleted: 'hidden' });
    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: COMMENT },
      data: { body: null, deletedAt: expect.any(Date) as Date },
    });
    expect(tx.comment.delete).not.toHaveBeenCalled();
  });

  it('removes a post comment with no replies', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row());
    tx.comment.count.mockResolvedValue(0);

    // Act
    const result = await deleteComment(ME, COMMENT);

    // Assert
    expect(result).toEqual({ deleted: 'removed' });
    expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: COMMENT } });
  });

  it('removes a reply under a review without a lock or opener check', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row({ ratingId: RATING }));

    // Act
    await deleteComment(ME, COMMENT);

    // Assert
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.comment.count).not.toHaveBeenCalled();
    expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: COMMENT } });
  });

  it("lets an admin delete someone else's comment", async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(ADMIN);
    db.comment.findUnique.mockResolvedValue(row({ authorId: DANA, ratingId: RATING }));

    // Act
    const result = await deleteComment(ME, COMMENT);

    // Assert
    expect(result).toEqual({ deleted: 'removed' });
  });

  it("is a 403 on someone else's comment for a member", async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(row({ authorId: DANA }));

    // Act + Assert
    await expectAppError(deleteComment(ME, COMMENT), 403, COMMENT_MESSAGES.authorOrAdmin);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("is a 403 for the other person on a direct item's comment", async () => {
    // Arrange
    requirePostAccess.mockResolvedValue(DIRECT);
    db.comment.findUnique.mockResolvedValue(row({ authorId: AUTHOR }));

    // Act + Assert
    await expectAppError(deleteComment(ME, COMMENT), 403, COMMENT_MESSAGES.authorOrAdmin);
  });

  it('is a 404 for a missing or already deleted comment', async () => {
    // Arrange
    db.comment.findUnique.mockResolvedValue(null);

    // Act + Assert
    await expectAppError(deleteComment(ME, COMMENT), 404, COMMENT_MESSAGES.notFound);
  });
});
