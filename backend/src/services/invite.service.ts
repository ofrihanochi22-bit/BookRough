import { CommunityRole, Prisma, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { generateInviteToken, hasInviteTokenShape } from '../utils/inviteToken.js';
import { type InvitePreview, toInvitePreview } from '../utils/invitePreview.js';
import { createLogger } from '../utils/logger.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { type PublicCommunity, toPublicCommunity } from '../utils/publicCommunity.js';
import { COMMUNITY_NOT_FOUND } from './community.service.js';

const log = createLogger('invite.service');

/** UC-15's fail-path wording, for unknown, reset and malformed tokens alike. */
export const INVITE_INVALID =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';
export const ADMINS_ONLY = 'Only admins can invite people.';

export interface Invite {
  token: string;
}

export interface AcceptResult {
  community: PublicCommunity;
  /** False when the caller was already a member: accepting is idempotent. */
  joined: boolean;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const isUniqueViolation = (error: unknown) => hasPrismaCode(error, 'P2002');
const isForeignKeyViolation = (error: unknown) => hasPrismaCode(error, 'P2003');

/**
 * The invite endpoints are for admins only (developer's choice, option A). A
 * non-member gets the same 404 as everywhere else; a plain member gets 403.
 */
async function requireAdmin(user: User, communityId: string): Promise<void> {
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AppError(COMMUNITY_NOT_FOUND, 404);
  }
  if (membership.role !== CommunityRole.ADMIN) {
    throw new AppError(ADMINS_ONLY, 403);
  }
}

/**
 * Writes a fresh token, retrying once on the (astronomically unlikely) collision.
 * With `onlyIfMissing`, the write happens only while the community still has no
 * token, so two admins opening the panel at once cannot overwrite each other.
 */
async function writeNewToken(communityId: string, onlyIfMissing = false): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.community.updateMany({
        where: onlyIfMissing ? { id: communityId, inviteToken: null } : { id: communityId },
        data: { inviteToken: generateInviteToken() },
      });
      return;
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }
}

async function currentToken(communityId: string): Promise<string | null> {
  const community = await prisma.community.findUniqueOrThrow({
    where: { id: communityId },
    select: { inviteToken: true },
  });
  return community.inviteToken;
}

/** GET /communities/:id/invite — the link, created on first request. */
export async function getInvite(user: User, communityId: string): Promise<Invite> {
  await requireAdmin(user, communityId);

  const existing = await currentToken(communityId);
  if (existing) {
    return { token: existing };
  }
  await writeNewToken(communityId, true);
  // Re-read: a racing admin's token, if theirs landed first, is the one that counts.
  return { token: (await currentToken(communityId))! };
}

/** POST /communities/:id/invite/reset — the old link stops working at once. */
export async function resetInvite(user: User, communityId: string): Promise<Invite> {
  await requireAdmin(user, communityId);

  await writeNewToken(communityId);
  log.info({ userId: user.id, communityId }, 'Invite link reset');
  return { token: (await currentToken(communityId))! };
}

const withMemberCount = { _count: { select: { members: true } } } as const;

/** The community behind a token, with its member count; null for anything unknown. */
async function findByToken(token: unknown) {
  if (!hasInviteTokenShape(token)) {
    return null;
  }
  return prisma.community.findUnique({ where: { inviteToken: token }, include: withMemberCount });
}

/** Just the id behind a token, for accept, which reads the full row afterwards. */
async function findIdByToken(token: unknown): Promise<string | null> {
  if (!hasInviteTokenShape(token)) {
    return null;
  }
  const community = await prisma.community.findUnique({
    where: { inviteToken: token },
    select: { id: true },
  });
  return community?.id ?? null;
}

/**
 * GET /invites/:token — public. A session is optional and only answers
 * "am I already in?".
 */
export async function previewInvite(token: unknown, user: User | null): Promise<InvitePreview> {
  const community = await findByToken(token);
  if (!community) {
    throw new AppError(INVITE_INVALID, 404);
  }

  const alreadyMember = user
    ? (await prisma.communityMember.count({
        where: { userId: user.id, communityId: community.id },
      })) > 0
    : false;
  return toInvitePreview(community, community._count.members, alreadyMember);
}

/**
 * POST /invites/:token/accept — joins as MEMBER. Idempotent: an existing member
 * (any role) gets the community back unchanged, including when two requests
 * race and the second hits the membership key.
 */
export async function acceptInvite(user: User, token: unknown): Promise<AcceptResult> {
  if (needsOnboarding(user)) {
    throw new AppError('Finish your profile first.', 403);
  }
  const communityId = await findIdByToken(token);
  if (!communityId) {
    throw new AppError(INVITE_INVALID, 404);
  }

  let joined = false;
  try {
    await prisma.communityMember.create({
      data: { userId: user.id, communityId, role: CommunityRole.MEMBER },
    });
    joined = true;
    log.info({ userId: user.id, communityId }, 'Joined community');
  } catch (error) {
    // The community was deleted after the lookup: the link is dead, same as a reset.
    if (isForeignKeyViolation(error)) {
      throw new AppError(INVITE_INVALID, 404);
    }
    // Already a member — earlier, or in a racing request. Nothing to change.
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }

  const membership = await prisma.communityMember.findUniqueOrThrow({
    where: { userId_communityId: { userId: user.id, communityId } },
    include: { community: { include: withMemberCount } },
  });
  return {
    community: toPublicCommunity(
      membership.community,
      membership.community._count.members,
      membership.role,
    ),
    joined,
  };
}
