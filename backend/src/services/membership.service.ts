import { CommunityRole, Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import {
  type BlockedUserView,
  type CommunityMemberView,
  memberUserSelect,
  toBlockedUser,
  toCommunityMember,
} from '../utils/communityMember.js';
import { createLogger } from '../utils/logger.js';
import { type PublicCommunity } from '../utils/publicCommunity.js';
import { getCommunity } from './community.service.js';
import { requireAdmin, requireMember, requireOwner } from './communityAccess.js';

const log = createLogger('membership.service');

export const MEMBER_NOT_FOUND = 'Member not found.';
export const NOT_BLOCKED = "This person isn't blocked.";
export const OWNER_CANNOT_LEAVE =
  "You're the owner. Transfer ownership to another member or delete the community before leaving.";
export const CANNOT_REMOVE_ADMIN =
  'Cannot remove an Admin. You must demote this user to a standard member before removing them.';
const ADMINS_REMOVE = 'Only admins can remove people.';
const ADMINS_ROLES = 'Only admins can change roles.';
const ADMINS_BLOCKS = 'Only admins can manage blocked people.';

/** Owner first, then admins, then members; oldest first within each. */
const ROLE_ORDER: Record<CommunityRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

/** The target's membership, or 404 "Member not found.". */
async function targetRole(communityId: string, userId: string): Promise<CommunityRole> {
  const target = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId } },
    select: { role: true },
  });
  if (!target) {
    throw new AppError(MEMBER_NOT_FOUND, 404);
  }
  return target.role;
}

/** GET /communities/:id/members — any member. */
export async function listMembers(user: User, communityId: string): Promise<CommunityMemberView[]> {
  await requireMember(user, communityId);
  const members = await prisma.communityMember.findMany({
    where: { communityId },
    orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    select: { role: true, joinedAt: true, user: { select: memberUserSelect } },
  });
  return members.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]).map(toCommunityMember);
}

/*
 * Every role-dependent write below is conditional on the role the check just
 * read (deleteMany / updateMany with `role` in the WHERE). A concurrent change
 * — a promotion, a transfer — then makes the write match nothing instead of
 * acting on a role it never checked, and the caller gets the error the new
 * state deserves. Without this, a transfer racing a demotion could leave a
 * community with no owner at all (the partial index only forbids two).
 */

export const OWNERSHIP_CHANGED = 'Ownership just changed. Reload and try again.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** DELETE /communities/:id/members/me — leaving never blocks; the owner must transfer first. */
export async function leaveCommunity(user: User, communityId: string): Promise<void> {
  const role = await requireMember(user, communityId);
  if (role === CommunityRole.OWNER) {
    throw new AppError(OWNER_CANNOT_LEAVE, 409);
  }
  const { count } = await prisma.communityMember.deleteMany({
    where: { userId: user.id, communityId, role: { not: CommunityRole.OWNER } },
  });
  if (count === 0) {
    // Gone already (404 from requireMember), or just made the owner.
    if ((await requireMember(user, communityId)) === CommunityRole.OWNER) {
      throw new AppError(OWNER_CANNOT_LEAVE, 409);
    }
  }
  log.info({ userId: user.id, communityId }, 'Left community');
}

/** Why a member cannot be removed, given their role; nothing for a MEMBER. */
function rejectRemoval(role: CommunityRole): void {
  if (role === CommunityRole.OWNER) {
    throw new AppError("The owner can't be removed.", 409);
  }
  if (role === CommunityRole.ADMIN) {
    throw new AppError(CANNOT_REMOVE_ADMIN, 409);
  }
}

/**
 * DELETE /communities/:id/members/:userId — removes a MEMBER and blocks them
 * in one transaction (developer's choice: every removal is a block).
 */
export async function removeMember(
  user: User,
  communityId: string,
  targetUserId: string,
): Promise<void> {
  await requireAdmin(user, communityId, ADMINS_REMOVE);
  if (targetUserId === user.id) {
    throw new AppError('Use Leave Community instead.', 422);
  }
  rejectRemoval(await targetRole(communityId, targetUserId));

  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.communityMember.deleteMany({
      where: { userId: targetUserId, communityId, role: CommunityRole.MEMBER },
    });
    if (count === 0) {
      return null;
    }
    // Removal also deletes their posts here, permanently (posts-feed.md §3.3).
    const posts = await tx.post.deleteMany({ where: { authorId: targetUserId, communityId } });
    await tx.communityBan.upsert({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      create: { communityId, userId: targetUserId, bannedById: user.id },
      update: { bannedById: user.id },
    });
    return { postsDeleted: posts.count };
  });
  if (!removed) {
    // Promoted or removed meanwhile: 404 if gone, 409 if now an admin.
    rejectRemoval(await targetRole(communityId, targetUserId));
  }
  log.info(
    { userId: user.id, communityId, targetUserId, postsDeleted: removed?.postsDeleted ?? 0 },
    'Removed and blocked member',
  );
}

const OWNER_ROLE_FIXED = "The owner's role can't be changed. Transfer ownership instead.";

/**
 * PATCH /communities/:id/members/:userId — promote or demote. An admin may
 * demote themselves; the owner's role only changes through a transfer.
 */
export async function changeRole(
  user: User,
  communityId: string,
  targetUserId: string,
  role: 'ADMIN' | 'MEMBER',
): Promise<CommunityMemberView> {
  await requireAdmin(user, communityId, ADMINS_ROLES);
  const current = await targetRole(communityId, targetUserId);
  if (current === CommunityRole.OWNER) {
    throw new AppError(OWNER_ROLE_FIXED, 409);
  }

  const { count } = await prisma.communityMember.updateMany({
    where: {
      userId: targetUserId,
      communityId,
      role: { in: [CommunityRole.ADMIN, CommunityRole.MEMBER] },
    },
    data: { role },
  });
  if (count === 0) {
    // Gone (404) or made the owner meanwhile (409).
    if ((await targetRole(communityId, targetUserId)) === CommunityRole.OWNER) {
      throw new AppError(OWNER_ROLE_FIXED, 409);
    }
  }
  if (current !== role) {
    log.info({ userId: user.id, communityId, targetUserId, role }, 'Changed member role');
  }

  const member = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: targetUserId, communityId } },
    select: { role: true, joinedAt: true, user: { select: memberUserSelect } },
  });
  if (!member) {
    throw new AppError(MEMBER_NOT_FOUND, 404);
  }
  return toCommunityMember(member);
}

/**
 * POST /communities/:id/ownership — the target becomes OWNER and the caller
 * ADMIN, in one transaction. The demotion runs first and only while the caller
 * is still the owner, so the one-owner index holds at every step and a second,
 * overlapping transfer is refused rather than half-applied.
 */
export async function transferOwnership(
  user: User,
  communityId: string,
  targetUserId: string,
): Promise<PublicCommunity> {
  await requireOwner(user, communityId);
  if (targetUserId === user.id) {
    throw new AppError("You're already the owner.", 422);
  }
  await targetRole(communityId, targetUserId);

  try {
    await prisma.$transaction(async (tx) => {
      const demoted = await tx.communityMember.updateMany({
        where: { userId: user.id, communityId, role: CommunityRole.OWNER },
        data: { role: CommunityRole.ADMIN },
      });
      if (demoted.count === 0) {
        throw new AppError(OWNERSHIP_CHANGED, 409);
      }
      const promoted = await tx.communityMember.updateMany({
        where: { userId: targetUserId, communityId },
        data: { role: CommunityRole.OWNER },
      });
      if (promoted.count === 0) {
        // The target left or was removed a moment earlier; nothing changes.
        throw new AppError(MEMBER_NOT_FOUND, 404);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(OWNERSHIP_CHANGED, 409);
    }
    throw error;
  }
  log.info({ userId: user.id, communityId, targetUserId }, 'Transferred ownership');
  return getCommunity(user, communityId);
}

/** GET /communities/:id/bans — admins; newest first. */
export async function listBlocked(user: User, communityId: string): Promise<BlockedUserView[]> {
  await requireAdmin(user, communityId, ADMINS_BLOCKS);
  const bans = await prisma.communityBan.findMany({
    where: { communityId },
    orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
    select: { createdAt: true, user: { select: memberUserSelect } },
  });
  return bans.map(toBlockedUser);
}

/** DELETE /communities/:id/bans/:userId — admins; lets them rejoin, does not re-add them. */
export async function unblock(
  user: User,
  communityId: string,
  targetUserId: string,
): Promise<void> {
  await requireAdmin(user, communityId, ADMINS_BLOCKS);
  const { count } = await prisma.communityBan.deleteMany({
    where: { communityId, userId: targetUserId },
  });
  if (count === 0) {
    throw new AppError(NOT_BLOCKED, 404);
  }
  log.info({ userId: user.id, communityId, targetUserId }, 'Unblocked user');
}
