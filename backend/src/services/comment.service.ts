import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { commentInclude, type PublicComment, toPublicComment } from '../utils/publicComment.js';
import { isAdminRole } from './communityAccess.js';
import { areFriends } from './friendship.js';
import { notifyCommentReply } from './notification.service.js';
import { type PostAccess, requirePostAccess } from './postAccess.js';
import { checkDiscussionBody } from './postText.js';
import { requireOnboarded } from './profile.service.js';

const log = createLogger('comment.service');

/** docs/features/discussion-threads.md §4. */
export const COMMENT_MESSAGES = {
  gone: 'That comment is gone.',
  notFound: 'Comment not found.',
  oneThread: 'A reply belongs to one thread.',
  friendsOnly: 'You can only comment on songs from friends.',
  authorOnly: 'Only the author can do this.',
  authorOrAdmin: 'Only the author or an admin can delete this.',
} as const;

export interface NewComment {
  body: string;
  ratingId?: string | undefined;
  parentId?: string | undefined;
  replyToId?: string | undefined;
}

function moderates(access: PostAccess): boolean {
  return access.scope === 'COMMUNITY' && isAdminRole(access.role);
}

/** Writing on a direct item needs current friendship, like a rating (D-log). */
async function requireWriter(user: User, access: PostAccess): Promise<void> {
  if (access.scope !== 'DIRECT') {
    return;
  }
  const other = access.isRecipient ? access.authorId : access.recipientId;
  if (!(await areFriends(user.id, other))) {
    throw new AppError(COMMENT_MESSAGES.friendsOnly, 403);
  }
}

function cleanBody(raw: string): string {
  const body = checkDiscussionBody(raw);
  if (!body.ok) {
    throw new AppError(body.message, 422);
  }
  return body.value;
}

/** GET /posts/:postId/comments — the whole discussion, oldest first. */
export async function listComments(user: User, postId: string): Promise<PublicComment[]> {
  requireOnboarded(user);
  const access = await requirePostAccess(user, postId);
  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: commentInclude,
  });
  return rows.map((row) => toPublicComment(row, user.id, moderates(access)));
}

/**
 * The thread a new comment joins, and who it answers (D2, D3): a review's
 * author, a post comment's author, someone already in that thread, or —
 * for a post comment — the post's author.
 */
async function resolveThread(
  postId: string,
  postAuthorId: string,
  input: NewComment,
): Promise<{ ratingId: string | null; parentId: string | null; readerId: string }> {
  if (input.ratingId && input.parentId) {
    throw new AppError(COMMENT_MESSAGES.oneThread, 422);
  }
  let opener: { authorId: string; ratingId: string | null; parentId: string | null };
  if (input.ratingId) {
    const rating = await prisma.rating.findFirst({
      where: { id: input.ratingId, postId, comment: { not: null } },
      select: { userId: true },
    });
    if (!rating) {
      throw new AppError(COMMENT_MESSAGES.gone, 404);
    }
    opener = { authorId: rating.userId, ratingId: input.ratingId, parentId: null };
  } else if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: {
        id: input.parentId,
        postId,
        ratingId: null,
        parentId: null,
        deletedAt: null,
      },
      select: { authorId: true },
    });
    if (!parent) {
      throw new AppError(COMMENT_MESSAGES.gone, 404);
    }
    opener = { authorId: parent.authorId, ratingId: null, parentId: input.parentId };
  } else {
    return { ratingId: null, parentId: null, readerId: postAuthorId };
  }

  let readerId = opener.authorId;
  if (input.replyToId && input.replyToId !== opener.authorId) {
    const inThread = await prisma.comment.findFirst({
      where: {
        postId,
        authorId: input.replyToId,
        ...(opener.ratingId ? { ratingId: opener.ratingId } : { parentId: opener.parentId }),
      },
      select: { id: true },
    });
    // Someone outside the thread is dropped, and the opener's author answered instead.
    if (inThread) {
      readerId = input.replyToId;
    }
  }
  return { ratingId: opener.ratingId, parentId: opener.parentId, readerId };
}

/** POST /posts/:postId/comments — a post comment, or a reply in a thread. */
export async function createComment(
  user: User,
  postId: string,
  input: NewComment,
): Promise<PublicComment> {
  requireOnboarded(user);
  const body = cleanBody(input.body);
  const access = await requirePostAccess(user, postId);
  await requireWriter(user, access);
  const thread = await resolveThread(postId, access.authorId, input);
  const isReply = thread.ratingId !== null || thread.parentId !== null;

  let row;
  try {
    row = await prisma.comment.create({
      data: {
        postId,
        authorId: user.id,
        body,
        ratingId: thread.ratingId,
        parentId: thread.parentId,
        // The label shows only on a reply; a post comment answers nobody.
        replyToId: isReply ? thread.readerId : null,
      },
      include: commentInclude,
    });
  } catch (error) {
    // The thread's opener (or the post) was deleted between the check and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new AppError(COMMENT_MESSAGES.gone, 404);
    }
    throw error;
  }
  log.info({ userId: user.id, postId, commentId: row.id }, 'Comment created');
  await notifyCommentReply({ postId, readerId: thread.readerId, actorId: user.id });
  return toPublicComment(row, user.id, moderates(access));
}

/** The comment, with access to its post checked; a deleted one is the same 404. */
async function requireComment(user: User, commentId: string) {
  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    include: commentInclude,
  });
  if (!row || row.deletedAt !== null) {
    throw new AppError(COMMENT_MESSAGES.notFound, 404);
  }
  let access: PostAccess;
  try {
    access = await requirePostAccess(user, row.postId);
  } catch (error) {
    // Whatever the reason the post is out of reach, the comment is simply not found.
    if (error instanceof AppError && (error.statusCode === 403 || error.statusCode === 404)) {
      throw new AppError(COMMENT_MESSAGES.notFound, 404);
    }
    throw error;
  }
  return { row, access };
}

/** PATCH /comments/:commentId — the author only; an unchanged body writes nothing. */
export async function editComment(
  user: User,
  commentId: string,
  rawBody: string,
): Promise<PublicComment> {
  requireOnboarded(user);
  const body = cleanBody(rawBody);
  const { row, access } = await requireComment(user, commentId);
  if (row.authorId !== user.id) {
    throw new AppError(COMMENT_MESSAGES.authorOnly, 403);
  }
  await requireWriter(user, access);
  if (row.body === body) {
    return toPublicComment(row, user.id, moderates(access));
  }
  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { body, editedAt: new Date() },
    include: commentInclude,
  });
  log.info({ userId: user.id, postId: row.postId, commentId }, 'Comment edited');
  return toPublicComment(updated, user.id, moderates(access));
}

/**
 * DELETE /comments/:commentId — the author, or an admin or owner of the post's
 * community (D4). A post comment with replies is hidden ("Comment deleted") so
 * its thread survives; anything else is removed, and a hidden opener whose last
 * reply goes is removed with it.
 */
export async function deleteComment(
  user: User,
  commentId: string,
): Promise<{ deleted: 'removed' | 'hidden' }> {
  requireOnboarded(user);
  const { row, access } = await requireComment(user, commentId);
  const byAuthor = row.authorId === user.id;
  if (!byAuthor && !moderates(access)) {
    throw new AppError(COMMENT_MESSAGES.authorOrAdmin, 403);
  }

  const isOpener = row.ratingId === null && row.parentId === null;
  const openerId = row.parentId ?? (isOpener ? commentId : null);
  const result = await prisma.$transaction(async (tx) => {
    // Lock the post comment that heads this thread: a reply inserted meanwhile
    // waits (its foreign key needs the row), and two deletes in one thread queue.
    if (openerId) {
      await tx.$queryRaw`SELECT id FROM comments WHERE id = ${openerId}::uuid FOR UPDATE`;
    }
    if (isOpener && (await tx.comment.count({ where: { parentId: commentId } })) > 0) {
      await tx.comment.update({
        where: { id: commentId },
        data: { body: null, deletedAt: new Date() },
      });
      return 'hidden' as const;
    }
    await tx.comment.delete({ where: { id: commentId } });
    if (row.parentId) {
      // The last reply under a hidden opener takes the opener with it.
      const remaining = await tx.comment.count({ where: { parentId: row.parentId } });
      if (remaining === 0) {
        await tx.comment.deleteMany({ where: { id: row.parentId, deletedAt: { not: null } } });
      }
    }
    return 'removed' as const;
  });
  log.info(
    { userId: user.id, postId: row.postId, commentId, deletedBy: byAuthor ? 'author' : 'admin' },
    'Comment deleted',
  );
  return { deleted: result };
}
