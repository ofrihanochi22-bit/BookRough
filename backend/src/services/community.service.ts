import { CommunityRole, type User } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { needsOnboarding } from '../utils/publicUser.js';
import { type PublicCommunity, toPublicCommunity } from '../utils/publicCommunity.js';
import { checkCommunityDescription, checkCommunityName } from './communityText.js';

const log = createLogger('community.service');

export const COMMUNITY_NOT_FOUND = 'Community not found.';

export interface NewCommunity {
  name: string;
  description?: string | null | undefined;
}

/** Loads each community with its member count, in one query. */
const withMemberCount = { _count: { select: { members: true } } } as const;

/**
 * POST /communities — the creator becomes its ADMIN in the same nested write,
 * so a community never exists without its admin. Only a user who has finished
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
      members: { create: { userId: user.id, role: CommunityRole.ADMIN } },
    },
  });

  log.info({ userId: user.id, communityId: community.id }, 'Community created');
  return toPublicCommunity(community, 1, CommunityRole.ADMIN);
}

/** The caller's communities, the one they joined most recently first. */
export async function listMyCommunities(user: User): Promise<PublicCommunity[]> {
  const memberships = await prisma.communityMember.findMany({
    where: { userId: user.id },
    orderBy: [{ joinedAt: 'desc' }, { communityId: 'asc' }],
    include: { community: { include: withMemberCount } },
  });

  return memberships.map(({ community, role }) =>
    toPublicCommunity(community, community._count.members, role),
  );
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
