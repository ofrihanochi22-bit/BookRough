import { CommunityRole, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { memberUserSelect } from '../utils/communityMember.js';
import {
  type CandidateStatus,
  type InviteCandidate,
  type MyInvitation,
  toInviteCandidate,
  toMyInvitation,
} from '../utils/invitationViews.js';
import { createLogger } from '../utils/logger.js';
import { isBanned, requireAdmin } from './communityAccess.js';
import { listFriends } from './friend.service.js';
import { notifyInvitation } from './invitationNotification.js';
import { ADMINS_ONLY } from './invite.service.js';
import { requireOnboarded } from './profile.service.js';

const log = createLogger('invitation.service');

export const INVITATION_GONE = 'This invitation is no longer available.';
export const MAX_INVITES = 50;

/** Admins and the owner invite, like the link (invite-friends.md §4, Q3). */
async function requireInviter(user: User, communityId: string): Promise<void> {
  requireOnboarded(user);
  await requireAdmin(user, communityId, ADMINS_ONLY);
}

/** Every friend of the caller, with their standing in the community. */
async function candidatesFor(user: User, communityId: string): Promise<InviteCandidate[]> {
  const friends = await listFriends(user);
  const ids = friends.map((friend) => friend.user.id);
  const [members, invited, banned] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId, userId: { in: ids } },
      select: { userId: true },
    }),
    prisma.communityInvitation.findMany({
      where: { communityId, userId: { in: ids } },
      select: { userId: true },
    }),
    prisma.communityBan.findMany({
      where: { communityId, userId: { in: ids } },
      select: { userId: true },
    }),
  ]);
  const idsOf = (rows: Array<{ userId: string }>) => new Set(rows.map((row) => row.userId));
  const memberIds = idsOf(members);
  const invitedIds = idsOf(invited);
  const bannedIds = idsOf(banned);

  const statusOf = (id: string): CandidateStatus => {
    if (memberIds.has(id)) return 'MEMBER';
    if (bannedIds.has(id)) return 'BLOCKED';
    if (invitedIds.has(id)) return 'INVITED';
    return 'INVITABLE';
  };
  // listFriends is alphabetical already.
  return friends.map((friend) => toInviteCandidate(friend.user, statusOf(friend.user.id)));
}

/** GET /communities/:id/invitations/candidates — the picker. */
export async function listCandidates(user: User, communityId: string): Promise<InviteCandidate[]> {
  await requireInviter(user, communityId);
  return candidatesFor(user, communityId);
}

/**
 * POST /communities/:id/invitations — invites the invitable friends among
 * `userIds`; anyone else is skipped silently, and the refreshed list shows why.
 */
export async function inviteFriends(
  user: User,
  communityId: string,
  userIds: string[],
): Promise<InviteCandidate[]> {
  await requireInviter(user, communityId);
  const before = await candidatesFor(user, communityId);
  const invitable = new Set(
    before.filter((candidate) => candidate.status === 'INVITABLE').map((c) => c.user.id),
  );
  const toInvite = [...new Set(userIds)].filter((id) => invitable.has(id));

  if (toInvite.length > 0) {
    // skipDuplicates: a second admin inviting the same friend at once is a no-op.
    await prisma.communityInvitation.createMany({
      data: toInvite.map((userId) => ({ communityId, userId, invitedById: user.id })),
      skipDuplicates: true,
    });
    log.info({ userId: user.id, communityId, count: toInvite.length }, 'Invitations sent');
    for (const userId of toInvite) {
      try {
        notifyInvitation({ communityId, userId, invitedById: user.id });
      } catch (error) {
        log.warn({ err: error, communityId }, 'Invitation notification failed');
      }
    }
  }
  return candidatesFor(user, communityId);
}

/** DELETE /communities/:id/invitations/:userId — an admin withdraws one. Idempotent. */
export async function cancelInvitation(
  user: User,
  communityId: string,
  inviteeId: string,
): Promise<InviteCandidate[]> {
  await requireInviter(user, communityId);
  const { count } = await prisma.communityInvitation.deleteMany({
    where: { communityId, userId: inviteeId },
  });
  if (count > 0) {
    log.info({ userId: user.id, communityId, inviteeId }, 'Invitation cancelled');
  }
  return candidatesFor(user, communityId);
}

/** GET /invitations — the caller's pending invitations, newest first. */
export async function listMyInvitations(user: User): Promise<MyInvitation[]> {
  requireOnboarded(user);
  const rows = await prisma.communityInvitation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      community: { select: { id: true, name: true, _count: { select: { members: true } } } },
      invitedBy: { select: memberUserSelect },
    },
  });
  return rows.map(toMyInvitation);
}

/** GET /invitations/count — for the Friends badge. */
export async function countMyInvitations(user: User): Promise<number> {
  requireOnboarded(user);
  return prisma.communityInvitation.count({ where: { userId: user.id } });
}

/**
 * POST /invitations/:communityId/accept — joins as MEMBER and uses up the
 * invitation together. A block added after the invitation wins without
 * saying so (the link's rule); an existing member just loses the invitation.
 */
export async function acceptInvitation(user: User, communityId: string): Promise<{ id: string }> {
  requireOnboarded(user);
  if (await isBanned(user.id, communityId)) {
    await prisma.communityInvitation.deleteMany({ where: { communityId, userId: user.id } });
    throw new AppError(INVITATION_GONE, 404);
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.communityInvitation.deleteMany({
      where: { communityId, userId: user.id },
    });
    if (count === 0) {
      throw new AppError(INVITATION_GONE, 404);
    }
    // ON CONFLICT DO NOTHING: joining by the link meanwhile is fine.
    await tx.communityMember.createMany({
      data: [{ userId: user.id, communityId, role: CommunityRole.MEMBER }],
      skipDuplicates: true,
    });
  });
  log.info({ userId: user.id, communityId }, 'Invitation accepted');
  return { id: communityId };
}

/** POST /invitations/:communityId/decline — silent and idempotent. */
export async function declineInvitation(user: User, communityId: string): Promise<void> {
  requireOnboarded(user);
  const { count } = await prisma.communityInvitation.deleteMany({
    where: { communityId, userId: user.id },
  });
  if (count > 0) {
    log.info({ userId: user.id, communityId }, 'Invitation declined');
  }
}
