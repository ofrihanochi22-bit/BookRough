import { CommunityRole, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { type PublicCommunity, toPublicCommunity } from '../utils/publicCommunity.js';
import { COMMUNITY_NOT_FOUND, requireAdmin, requireOwner } from './communityAccess.js';
import { checkCommunityDescription, checkCommunityName } from './communityText.js';

const log = createLogger('community.service');

export { COMMUNITY_NOT_FOUND };

export interface NewCommunity {
  name: string;
  description?: string | null | undefined;
}

/** Loads each community with its member count, in one query. */
const withMemberCount = { _count: { select: { members: true } } } as const;

/**
 * POST /communities — the creator becomes its OWNER in the same nested write,
 * so a community never exists without its owner. Only a user who has finished
 * onboarding can create one: an admin with no display name could not be shown.
 */
export async function createCommunity(user: User, input: NewCommunity): Promise<PublicCommunity> {
  if (needsOnboarding(user)) {
    throw new AppError('Finish your profile first.', 403);
  }

  const name = checkCommunityName(input.name);
  if (!name.ok) {
    throw new AppError(name.message, 422);
  }
  const description = checkCommunityDescription(input.description);
  if (!description.ok) {
    throw new AppError(description.message, 422);
  }

  const community = await prisma.community.create({
    data: {
      name: name.value,
      description: description.value,
      members: { create: { userId: user.id, role: CommunityRole.OWNER } },
    },
  });

  log.info({ userId: user.id, communityId: community.id }, 'Community created');
  return toPublicCommunity(community, 1, CommunityRole.OWNER);
}

/**
 * The order of Home's list (manual-test-fixes-1122.md §4): a fixed ICU
 * collator, so every environment sorts the same whatever the database's
 * collation. Case and accents are ignored, numbers sort by value, and Latin
 * comes before Hebrew.
 */
const byName = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Two communities in Home's order: by name, then by id when the names compare equal. */
export function compareCommunities(
  a: { id: string; name: string },
  b: { id: string; name: string },
): number {
  return byName.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The caller's communities, alphabetically by name. */
export async function listMyCommunities(user: User): Promise<PublicCommunity[]> {
  const memberships = await prisma.communityMember.findMany({
    where: { userId: user.id },
    include: { community: { include: withMemberCount } },
  });

  return memberships
    .map(({ community, role }) => toPublicCommunity(community, community._count.members, role))
    .sort(compareCommunities);
}

/**
 * One community, for a member only. A missing community and one the caller is
 * not in give the same 404, so an outsider cannot learn that it exists.
 */
export async function getCommunity(user: User, communityId: string): Promise<PublicCommunity> {
  const membership = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId: user.id, communityId } },
    include: { community: { include: withMemberCount } },
  });
  if (!membership) {
    throw new AppError(COMMUNITY_NOT_FOUND, 404);
  }

  const { community, role } = membership;
  return toPublicCommunity(community, community._count.members, role);
}

export interface CommunityUpdate {
  name?: string | undefined;
  description?: string | null | undefined;
}

/** PATCH /communities/:id — admins; the same rules as creating. */
export async function updateCommunity(
  user: User,
  communityId: string,
  update: CommunityUpdate,
): Promise<PublicCommunity> {
  await requireAdmin(user, communityId, 'Only admins can edit the community.');

  const data: { name?: string; description?: string | null } = {};
  if (update.name !== undefined) {
    const name = checkCommunityName(update.name);
    if (!name.ok) {
      throw new AppError(name.message, 422);
    }
    data.name = name.value;
  }
  if (update.description !== undefined) {
    const description = checkCommunityDescription(update.description);
    if (!description.ok) {
      throw new AppError(description.message, 422);
    }
    data.description = description.value;
  }

  await prisma.community.update({ where: { id: communityId }, data });
  log.info({ userId: user.id, communityId }, 'Community edited');
  return getCommunity(user, communityId);
}

/**
 * DELETE /communities/:id — the owner only. Memberships, blocks and posts go
 * with it through the cascades. There is no undo.
 */
export async function deleteCommunity(user: User, communityId: string): Promise<void> {
  await requireOwner(user, communityId, 'Only the owner can delete the community.');
  await prisma.community.delete({ where: { id: communityId } });
  log.info({ userId: user.id, communityId }, 'Community deleted');
}
