import { Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { postInclude, type PublicPost, toPublicPost } from '../utils/publicPost.js';
import { NO_RATINGS } from '../utils/ratingSummary.js';
import {
  COMMUNITY_NOT_FOUND,
  isAdminRole,
  POST_NOT_FOUND,
  requireMember,
} from './communityAccess.js';
import { friendsOnPosts } from './friendship.js';
import { type ConversionResult, convertLink } from './linkScraper.service.js';
import { checkPostAccess, requirePostAccess } from './postAccess.js';
import { checkPostComment } from './postText.js';
import { ratingSummaries, summaryFor } from './ratingSummary.js';
import { INVALID_LINK, parseSupportedLink } from './supportedLinks.js';

const log = createLogger('post.service');

export { POST_NOT_FOUND } from './communityAccess.js';
export const AUTHOR_ONLY = 'Only the author can do this.';
export const ALREADY_CONVERTED = 'This post already has its links.';
export const AUTHOR_OR_ADMIN = 'Only the author or an admin can delete this post.';
export const SENDER_ONLY = 'Only the sender can delete this.';
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
 * The columns every new post or direct recommendation shares: validates, then
 * converts. Only a link we can tell is wrong — its shape, or squigly's explicit
 * "could not be found" — is refused; a conversion that cannot run gives a
 * pending post (CLAUDE.md §7).
 */
export async function prepareSharedLink(input: NewPost) {
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
  return {
    originalUrl: link.url,
    sourceService: link.service,
    textComment: comment.value,
    ...(result.outcome === 'converted' ? conversionData(result) : { conversionPending: true }),
  };
}

/** POST /communities/:id/posts — UC-11. Synchronous: it returns once the post is saved. */
export async function createPost(
  user: User,
  communityId: string,
  input: NewPost,
): Promise<PublicPost> {
  await requireMember(user, communityId);
  const shared = await prepareSharedLink(input);

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
        data: { authorId: user.id, communityId, ...shared },
        include: postInclude(user.id),
      });
    });

    log.info(
      { userId: user.id, communityId, postId: post.id, conversionPending: post.conversionPending },
      'Post created',
    );
    // The author may always delete their own post; a new post has no ratings yet.
    return toPublicPost(post, user.id, false, NO_RATINGS);
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

/** The keyset filter for rows ordered by createdAt, then id, both descending. */
export function beforeCursor(cursor: Cursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
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
      ...(cursor && beforeCursor(cursor)),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: postInclude(user.id),
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const summaries = await ratingSummaries(page.map((post) => post.id));
  return {
    posts: page.map((post) =>
      toPublicPost(post, user.id, moderates, summaryFor(summaries, post.id)),
    ),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/**
 * POST /posts/:postId/conversion — the author retries a pending post. A post the
 * caller cannot reach is a 404, like a missing one; on a direct item the sender
 * may retry after unfriending (direct-recommendations.md §3.4).
 */
export async function retryConversion(user: User, postId: string): Promise<PublicPost> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  await checkPostAccess(user, post);
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
  const [summaries, friends] = await Promise.all([
    ratingSummaries([postId]),
    friendsOnPosts(user.id, [current]),
  ]);
  return toPublicPost(current, user.id, false, summaryFor(summaries, postId), friends);
}

/**
 * DELETE /posts/:postId — UC-18. The author, or an admin or the owner of the
 * post's community, whoever wrote it (docs/features/posts-delete.md §4). On a
 * direct item only the sender deletes, for both; the recipient hides instead
 * (docs/features/direct-recommendations.md §3.5). A post the caller cannot
 * reach is a 404, like a missing one.
 */
export async function deletePost(user: User, postId: string): Promise<void> {
  const access = await requirePostAccess(user, postId);
  const byAuthor = access.authorId === user.id;
  if (access.scope === 'COMMUNITY' && !byAuthor && !isAdminRole(access.role)) {
    throw new AppError(AUTHOR_OR_ADMIN, 403);
  }
  if (access.scope === 'DIRECT' && !byAuthor) {
    throw new AppError(SENDER_ONLY, 403);
  }

  // By id only: matching nothing means someone (or a removal) deleted it first.
  const { count } = await prisma.post.deleteMany({ where: { id: postId } });
  if (count === 0) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  log.info(
    {
      userId: user.id,
      ...(access.scope === 'COMMUNITY' && { communityId: access.communityId }),
      postId,
      byAuthor,
    },
    'Post deleted',
  );
}

/**
 * GET /posts/:postId — Post Detail's card (docs/features/post-detail.md §4).
 * `community` is null on a direct item.
 */
export async function getPost(
  user: User,
  postId: string,
): Promise<{ post: PublicPost; community: { id: string; name: string } | null }> {
  const access = await requirePostAccess(user, postId);
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { ...postInclude(user.id), community: { select: { id: true, name: true } } },
  });
  if (!post) {
    // Deleted between the two reads.
    throw new AppError(POST_NOT_FOUND, 404);
  }
  const [summaries, friends] = await Promise.all([
    ratingSummaries([postId]),
    friendsOnPosts(user.id, [post]),
  ]);
  const moderates = access.scope === 'COMMUNITY' && isAdminRole(access.role);
  return {
    post: toPublicPost(post, user.id, moderates, summaryFor(summaries, postId), friends),
    community: post.community && { id: post.community.id, name: post.community.name },
  };
}
