import { type MemberUser, toMemberUser } from './communityMember.js';

/** A friend's standing in a community, for the picker (docs/features/invite-friends.md §4). */
export type CandidateStatus = 'INVITABLE' | 'INVITED' | 'MEMBER' | 'BLOCKED';

export interface InviteCandidate {
  user: MemberUser;
  status: CandidateStatus;
}

/** One of the caller's pending invitations. */
export interface MyInvitation {
  community: { id: string; name: string; memberCount: number };
  /** Null once the inviter's account is gone. */
  invitedBy: MemberUser | null;
  sentAt: string;
}

export function toInviteCandidate(user: MemberUser, status: CandidateStatus): InviteCandidate {
  return { user: toMemberUser(user), status };
}

/** Field by field: no invite token, description or role ever leaves with an invitation. */
export function toMyInvitation(row: {
  createdAt: Date;
  community: { id: string; name: string; _count: { members: number } };
  invitedBy: { id: string; displayName: string | null; profilePictureUrl: string | null } | null;
}): MyInvitation {
  return {
    community: {
      id: row.community.id,
      name: row.community.name,
      memberCount: row.community._count.members,
    },
    invitedBy: row.invitedBy ? toMemberUser(row.invitedBy) : null,
    sentAt: row.createdAt.toISOString(),
  };
}
