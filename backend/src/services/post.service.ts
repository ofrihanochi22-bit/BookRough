import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { postInclude, type PublicPost, toPublicPost } from '../utils/publicPost.js';
import { COMMUNITY_NOT_FOUND, isAdminRole, requireMember } from './communityAccess.js';
import { type ConversionResult, convertLink } from './linkScraper.service.js';
import { checkPostComment } from './postText.js';
import { INVALID_LINK, parseSupportedLink } from './supportedLinks.js';

const log = createLogger('post.service');

export const POST_NOT_FOUND = 'Post not found.';
export const AUTHOR_ONLY = 'Only the author can do this.';
export const ALREADY_CONVERTED = 'This post already has its links.';
export const AUTHOR_OR_ADMIN = 'Only the author or an admin can delete this post.';
export const PAGE_SIZE = 20;

export interface NewPost {
  url: string;
  comment?: string | null | undefined;
}

/** The columns a successful conversion fills in. */
function conversionData(result: ConversionResult & { outcome: 'converted' }) {
  return {
    kind: result.kind,
    songTitle: result.title,
    songArtist: result.artist,
    songCoverArtUrl: result.coverArtUrl,
    universalLinkSpotify: result.links.SPOTIFY ?? null,
    universalLinkApple: result.links.APPLE_MUSIC ?? null,
    universalLinkYoutube: result.links.YOUTUBE ?? null,
    universalLinkTidal: result.links.TIDAL ?? null,
    universalLinkDeezer: result.links.DEEZER ?? null,
    conversionPending: false,
  };
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * POST /communities/:id/posts — UC-11. Synchronous: it returns once the post is
 * saved, converted or not (CLAUDE.md §7). Only a link we can tell is wrong —
 * its shape, or squigly's explicit "could not be found" — is refused; a
 * conversion that cannot run saves the post as pending.
 */
export async function createPost(
  user: User,
  communityId: string,
  input: NewPost,
): Promise<PublicPost> {
  await requireMember(user, communityId);

  const link = parseSupportedLink(input.url);
  if (!link) {
    throw new AppError(INVALID_LINK, 422);
  }
  const comment = checkPostComment(input.comment);
  if (!comment.ok) {
    throw new AppError(comment.message, 422);
  }

  const result = await convertLink(link.url, link.service);
  if (result.outcome === 'not_found') {
    throw new AppError(INVALID_LINK, 422);
  }

  try {
    const post = await prisma.$transaction(async (tx) => {
      // The conversion took seconds: the caller may have been removed, or the
      // community deleted, meanwhile. FOR SHARE holds the membership until this
      // insert commits, so a removal running now waits and then deletes this
      // post with the others (CLAUDE.md §4: not expressible in Prisma).
      const membership = await tx.$queryRaw<unknown[]>(Prisma.sql`
        SELECT 1 FROM community_members
        WHERE user_id = ${user.id}::uuid AND community_id = ${communityId}::uuid
        FOR SHARE`);
      if (membership.length === 0) {
        throw new AppError(COMMUNITY_NOT_FOUND, 404);
      }
      return tx.post.create({
        data: {
          authorId: user.id,
          communityId,
          originalUrl: link.url,
          sourceService: link.service,
          textComment: comment.value,
          ...(result.outcome === 'converted'
            ? conversionData(result)
            : { conversionPending: true }),
        },
        include: postInclude(user.id),
      });
    });

    log.info(
      { userId: user.id, communityId, postId: post.id, conversionPending: post.conversionPending },
      'Post created',
    );
    // The author may always delete their own post.
    return toPublicPost(post, user.id, false);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AppError(COMMUNITY_NOT_FOUND, 404);
    }
    throw error;
  }
}

interface Cursor {
  createdAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(post: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([post.createdAt.toISOString(), post.id])).toString('base64url');
}

/** Opaque to clients; anything that does not decode cleanly is a 422. */
export function decodeCursor(raw: string): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2) {
      const [createdAt, id] = value as unknown[];
      const date = typeof createdAt === 'string' ? new Date(createdAt) : null;
      if (date && !Number.isNaN(date.getTime()) && typeof id === 'string' && UUID.test(id)) {
        return { createdAt: date, id };
      }
    }
  } catch {
    // Falls through to the 422.
  }
  throw new AppError('The request query is invalid.', 422);
}

/** GET /communities/:id/posts — newest first, keyset-paginated. */
export async function listPosts(
  user: User,
  communityId: string,
  before?: string,
): Promise<{ posts: PublicPost[]; nextCursor: string | null }> {
  const cursor = before === undefined ? null : decodeCursor(before);
  const role = await requireMember(user, communityId);
  const moderates = isAdminRole(role);

  const rows = await prisma.post.findMany({
    where: {
      communityId,
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: postInclude(user.id),
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    posts: page.map((post) => toPublicPost(post, user.id, moderates)),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/**
 * POST /posts/:postId/conversion — the author retries a pending post. A post in
 * a community the caller is not in is a 404, like the community itself.
 */
export async function retryConversion(user: User, postId: string): Promise<PublicPost> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId: post.communityId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  if (post.authorId !== user.id) {
    throw new AppError(AUTHOR_ONLY, 403);
  }
  if (!post.conversionPending) {
    throw new AppError(ALREADY_CONVERTED, 409);
  }

  const result = await convertLink(post.originalUrl, post.sourceService);
  if (result.outcome === 'converted') {
    // Conditional, so a double tap writes once and the second sees the result.
    await prisma.post.updateMany({
      where: { id: postId, conversionPending: true },
      data: conversionData(result),
    });
  }

  const current = await prisma.post.findUnique({
    where: { id: postId },
    include: postInclude(user.id),
  });
  if (!current) {
    // Deleted (or its author removed) while converting.
    throw new AppError(POST_NOT_FOUND, 404);
  }
  log.info(
    {
      userId: user.id,
      communityId: current.communityId,
      postId,
      conversionPending: current.conversionPending,
    },
    'Post conversion retried',
  );
  return toPublicPost(current, user.id, false);
}

/**
 * DELETE /posts/:postId — UC-18. The author, or an admin or the owner of the
 * post's community, whoever wrote it (docs/features/posts-delete.md §4). A
 * post in a community the caller is not in is a 404, like the community.
 */
export async function deletePost(user: User, postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, communityId: true },
  });
  if (!post) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId: post.communityId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  const byAuthor = post.authorId === user.id;
  if (!byAuthor && !isAdminRole(membership.role)) {
    throw new AppError(AUTHOR_OR_ADMIN, 403);
  }

  // By id only: matching nothing means someone (or a removal) deleted it first.
  const { count } = await prisma.post.deleteMany({ where: { id: postId } });
  if (count === 0) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  log.info({ userId: user.id, communityId: post.communityId, postId, byAuthor }, 'Post deleted');
}
