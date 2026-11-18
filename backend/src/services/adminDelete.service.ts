import { CommunityRole, Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { notifyCommunityRemoved, notifyRole } from './notification.service.js';

/**
 * The admin deletes a user or a community (docs/features/admin-delete.md).
 * Callers are already gated by requireAppAdmin. Ids only in the logs.
 */

const log = createLogger('adminDelete.service');

export const ADMIN_DELETE_MESSAGES = {
  userNotFound: 'User not found.',
  communityNotFound: 'Community not found.',
  adminTarget: "Admins can't be deleted here.",
  selfTarget: "You can't delete yourself.",
  changed: 'Something changed while deleting. Nothing was deleted; try again.',
} as const;

/**
 * Deleting a user or a community cascades through every table and runs several
 * round trips per owned community; Prisma's default 5 s is too tight on a cold database.
 */
const TRANSACTION_OPTIONS = { timeout: 15_000 } as const;

type Db = Prisma.TransactionClient | typeof prisma;

interface Successor {
  id: string;
  displayName: string | null;
  role: CommunityRole;
}

/**
 * Who takes over a community whose owner is deleted (D2): its longest-standing
 * ADMIN, else its longest-standing MEMBER; ties on `joined_at` by `user_id`.
 * Banned people are not members, so they can't be chosen.
 */
async function pickSuccessor(
  db: Db,
  communityId: string,
  leavingUserId: string,
): Promise<Successor | null> {
  for (const role of [CommunityRole.ADMIN, CommunityRole.MEMBER]) {
    const member = await db.communityMember.findFirst({
      where: { communityId, role, userId: { not: leavingUserId } },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: { user: { select: { id: true, displayName: true } } },
    });
    if (member) {
      return { ...member.user, role };
    }
  }
  return null;
}

/** The target must exist, must not be the caller, and must not be an app admin (D4). */
async function requireDeletableUser(db: Db, admin: User, userId: string) {
  if (userId.toLowerCase() === admin.id.toLowerCase()) {
    throw new AppError(ADMIN_DELETE_MESSAGES.selfTarget, 403);
  }
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, role: true },
  });
  if (!target) {
    throw new AppError(ADMIN_DELETE_MESSAGES.userNotFound, 404);
  }
  if (target.role === 'ADMIN') {
    throw new AppError(ADMIN_DELETE_MESSAGES.adminTarget, 403);
  }
  return target;
}

function ownedCommunities(db: Db, userId: string) {
  return db.communityMember.findMany({
    where: { userId, role: CommunityRole.OWNER },
    orderBy: { communityId: 'asc' },
    select: { community: { select: { id: true, name: true } } },
  });
}

export interface UserDeletionPreview {
  displayName: string | null;
  counts: { posts: number; ratings: number; comments: number };
  communities: {
    id: string;
    name: string;
    outcome: 'TRANSFER' | 'DELETE';
    newOwner?: { id: string; displayName: string | null };
  }[];
}

/** GET /api/admin/users/:userId/deletion-preview — what the "Are you sure?" dialog shows. */
export async function previewUserDeletion(
  admin: User,
  userId: string,
): Promise<UserDeletionPreview> {
  const target = await requireDeletableUser(prisma, admin, userId);
  const [posts, ratings, comments, owned] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.rating.count({ where: { userId } }),
    prisma.comment.count({ where: { authorId: userId } }),
    ownedCommunities(prisma, userId),
  ]);
  const communities = await Promise.all(
    owned.map(async ({ community }) => {
      const successor = await pickSuccessor(prisma, community.id, userId);
      return successor
        ? {
            id: community.id,
            name: community.name,
            outcome: 'TRANSFER' as const,
            newOwner: { id: successor.id, displayName: successor.displayName },
          }
        : { id: community.id, name: community.name, outcome: 'DELETE' as const };
    }),
  );
  return { displayName: target.displayName, counts: { posts, ratings, comments }, communities };
}

export interface UserDeletionResult {
  transferred: { communityId: string; newOwnerId: string }[];
  deletedCommunities: string[];
}

/**
 * DELETE /api/admin/users/:userId — a full hard delete through the cascades (D1),
 * in one transaction. The target's row is locked first, so a second delete or a
 * role change waits for this one and then sees what it did. Each owned community
 * is handed to the successor chosen at that moment (D2) — the old owner's row
 * goes first, because the one-owner index allows a single OWNER — or deleted if
 * nobody else is a member. The new owners are told after the commit, so a
 * notification failure never undoes the delete.
 */
export async function deleteUser(admin: User, userId: string): Promise<UserDeletionResult> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    await requireDeletableUser(tx, admin, userId);

    const transferred: UserDeletionResult['transferred'] = [];
    const deletedCommunities: string[] = [];
    const owned = await ownedCommunities(tx, userId);
    await lockCommunities(
      tx,
      owned.map(({ community }) => community.id),
    );
    for (const { community } of owned) {
      // Counted rather than delete(): if the owner transferred or the community went
      // meanwhile, the whole deletion rolls back with a clear 409, not a 500.
      const { count } = await tx.communityMember.deleteMany({
        where: { userId, communityId: community.id, role: CommunityRole.OWNER },
      });
      if (count === 0) {
        throw new AppError(ADMIN_DELETE_MESSAGES.changed, 409);
      }
      const successor = await promoteSuccessor(tx, community.id, userId);
      if (successor) {
        transferred.push({ communityId: community.id, newOwnerId: successor });
      } else {
        await tx.community.delete({ where: { id: community.id } });
        deletedCommunities.push(community.id);
      }
    }
    await tx.user.delete({ where: { id: userId } });
    return { transferred, deletedCommunities };
  }, TRANSACTION_OPTIONS);

  log.info(
    {
      adminId: admin.id,
      userId,
      transferred: result.transferred.length,
      deletedCommunities: result.deletedCommunities.length,
    },
    'Admin deleted a user',
  );
  await Promise.all(
    result.transferred.map(({ communityId, newOwnerId }) =>
      notifyRole({ communityId, userId: newOwnerId, actorId: admin.id, role: 'OWNER' }),
    ),
  );
  return result;
}

/**
 * Locks the communities' rows until the transaction ends. A new membership row
 * checks its foreign key with a share lock on the community, so nobody can join
 * in between: the member list read afterwards is complete.
 */
async function lockCommunities(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  if (ids.length > 0) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM communities WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) FOR UPDATE`,
    );
  }
}

/**
 * Promotes the successor to OWNER. The update is conditional on the role it was
 * chosen with, so a member who left or changed role meanwhile is skipped and the
 * next candidate is tried.
 */
async function promoteSuccessor(
  tx: Prisma.TransactionClient,
  communityId: string,
  leavingUserId: string,
): Promise<string | null> {
  for (;;) {
    const successor = await pickSuccessor(tx, communityId, leavingUserId);
    if (!successor) {
      return null;
    }
    const { count } = await tx.communityMember.updateMany({
      where: { communityId, userId: successor.id, role: successor.role },
      data: { role: CommunityRole.OWNER },
    });
    if (count === 1) {
      return successor.id;
    }
  }
}

/**
 * DELETE /api/admin/communities/:communityId — the owner's delete (cascades, no
 * undo) with the admin's authorisation. Every former member, the owner included,
 * is told afterwards with the community's name (D5).
 */
export async function deleteCommunityAsAdmin(admin: User, communityId: string): Promise<void> {
  const removed = await prisma.$transaction(async (tx) => {
    await lockCommunities(tx, [communityId]);
    const community = await tx.community.findUnique({
      where: { id: communityId },
      select: { name: true, members: { select: { userId: true } } },
    });
    if (!community) {
      throw new AppError(ADMIN_DELETE_MESSAGES.communityNotFound, 404);
    }
    // deleteMany, not delete: a concurrent delete leaves nothing here, and that is a 404, not a 500.
    const { count } = await tx.community.deleteMany({ where: { id: communityId } });
    if (count === 0) {
      throw new AppError(ADMIN_DELETE_MESSAGES.communityNotFound, 404);
    }
    return { name: community.name, memberIds: community.members.map((m) => m.userId) };
  }, TRANSACTION_OPTIONS);

  log.info(
    { adminId: admin.id, communityId, members: removed.memberIds.length },
    'Admin deleted a community',
  );
  await notifyCommunityRemoved({
    actorId: admin.id,
    communityName: removed.name,
    userIds: removed.memberIds,
  });
}
