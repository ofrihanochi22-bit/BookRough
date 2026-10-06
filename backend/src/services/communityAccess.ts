import { CommunityRole, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';

export const COMMUNITY_NOT_FOUND = 'Community not found.';
export const POST_NOT_FOUND = 'Post not found.';

/** The owner counts as an admin everywhere (docs/features/communities-membership.md §3.1). */
export function isAdminRole(role: CommunityRole): boolean {
  return role === CommunityRole.ADMIN || role === CommunityRole.OWNER;
}

/**
 * The caller's role in a community. A non-member gets the same 404 as a
 * missing community, so an outsider cannot learn that it exists.
 */
export async function requireMember(user: User, communityId: string): Promise<CommunityRole> {
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError(COMMUNITY_NOT_FOUND, 404);
  }
  return membership.role;
}

/** Members who are not admins (or the owner) get 403 with the action's own message. */
export async function requireAdmin(
  user: User,
  communityId: string,
  message: string,
): Promise<CommunityRole> {
  const role = await requireMember(user, communityId);
  if (!isAdminRole(role)) {
    throw new AppError(message, 403);
  }
  return role;
}

export const OWNER_ONLY = 'Only the owner can do this.';

export async function requireOwner(
  user: User,
  communityId: string,
  message = OWNER_ONLY,
): Promise<void> {
  const role = await requireMember(user, communityId);
  if (role !== CommunityRole.OWNER) {
    throw new AppError(message, 403);
  }
}

/** True when the user is blocked from rejoining the community. */
export async function isBanned(userId: string, communityId: string): Promise<boolean> {
  const ban = await prisma.communityBan.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { userId: true },
  });
  return ban !== null;
}

/**
 * A post the caller may act on: it exists and they are a member of its
 * community now. Anything else is the same 404, so an outsider cannot learn
 * that the post exists.
 */
export async function requirePostMember(
  user: User,
  postId: string,
): Promise<{ authorId: string; communityId: string; role: CommunityRole }> {
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
  return { ...post, role: membership.role };
}
