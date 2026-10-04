import type { CommunityRole } from '@prisma/client';

/** The only part of a user that member lists, blocked lists and posts ever show. */
export interface MemberUser {
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
}

export interface CommunityMemberView {
  user: MemberUser;
  role: CommunityRole;
  joinedAt: string;
}

export interface BlockedUserView {
  user: MemberUser;
  blockedAt: string;
}

interface UserFields {
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
}

/**
 * Field by field, like every serialiser here: no preferred service, no
 * account dates, nothing else from `users`. Members have always finished
 * onboarding (joining and creating require it), so the name is present; the
 * fallback only guards rows edited by hand.
 */
export function toMemberUser(user: UserFields): MemberUser {
  return {
    id: user.id,
    displayName: user.displayName ?? 'Unknown',
    profilePictureUrl: user.profilePictureUrl,
  };
}

export function toCommunityMember(member: {
  role: CommunityRole;
  joinedAt: Date;
  user: UserFields;
}): CommunityMemberView {
  return {
    user: toMemberUser(member.user),
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}

export function toBlockedUser(ban: { createdAt: Date; user: UserFields }): BlockedUserView {
  return { user: toMemberUser(ban.user), blockedAt: ban.createdAt.toISOString() };
}

/** What Prisma must select for the serialisers above — and nothing more. */
export const memberUserSelect = {
  id: true,
  displayName: true,
  profilePictureUrl: true,
} as const;
