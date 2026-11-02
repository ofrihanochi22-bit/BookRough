import type { CommunityRole, User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { POST_NOT_FOUND } from './communityAccess.js';

/** Who a post is shared with, and how the caller stands (direct-recommendations.md §3.3). */
export type PostAccess =
  | { scope: 'COMMUNITY'; authorId: string; communityId: string; role: CommunityRole }
  | { scope: 'DIRECT'; authorId: string; recipientId: string; isRecipient: boolean };

interface PostTarget {
  authorId: string;
  communityId: string | null;
  recipientId: string | null;
}

/**
 * The one rule for who may reach a post, given a post already read: a current
 * member of its community, or the two people a direct recommendation is
 * between. Anyone else gets the same 404, so an outsider cannot learn that the
 * post exists. Friendship is not needed to read (§3.2).
 */
export async function checkPostAccess(user: User, post: PostTarget): Promise<PostAccess> {
  const { authorId, communityId, recipientId } = post;
  if (communityId !== null) {
    const membership = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId } },
      select: { role: true },
    });
    if (!membership) {
      throw new AppError(POST_NOT_FOUND, 404);
    }
    return { scope: 'COMMUNITY', authorId, communityId, role: membership.role };
  }
  if (recipientId === null || (user.id !== authorId && user.id !== recipientId)) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  return { scope: 'DIRECT', authorId, recipientId, isRecipient: user.id === recipientId };
}

/** Reads the post, then applies `checkPostAccess`; a missing post is the same 404. */
export async function requirePostAccess(user: User, postId: string): Promise<PostAccess> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, communityId: true, recipientId: true },
  });
  if (!post) {
    throw new AppError(POST_NOT_FOUND, 404);
  }
  return checkPostAccess(user, post);
}
