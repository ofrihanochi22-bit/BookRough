import type { CommunityRole, PublicCommunity } from './communities';
import { api, type SuccessBody } from './client';

export interface MemberUser {
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
}

/** Mirrors the backend's CommunityMemberView. */
export interface CommunityMember {
  user: MemberUser;
  role: CommunityRole;
  joinedAt: string;
}

/** Mirrors the backend's BlockedUserView. */
export interface BlockedUser {
  user: MemberUser;
  blockedAt: string;
}

export interface CommunityChanges {
  name?: string;
  description?: string | null;
}

// The Settings screen shows every error itself, so the global toast is skipped.
const quiet = { skipErrorToast: true } as const;
const base = (communityId: string) => `/communities/${encodeURIComponent(communityId)}`;

export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  const response = await api.get<SuccessBody<{ members: CommunityMember[] }>>(
    `${base(communityId)}/members`,
    quiet,
  );
  return response.data.data.members;
}

export async function listBlocked(communityId: string): Promise<BlockedUser[]> {
  const response = await api.get<SuccessBody<{ blocked: BlockedUser[] }>>(
    `${base(communityId)}/bans`,
    quiet,
  );
  return response.data.data.blocked;
}

export async function leaveCommunity(communityId: string): Promise<void> {
  await api.delete(`${base(communityId)}/members/me`, quiet);
}

/** Removes and blocks a member. */
export async function removeMember(communityId: string, userId: string): Promise<void> {
  await api.delete(`${base(communityId)}/members/${encodeURIComponent(userId)}`, quiet);
}

export async function changeRole(
  communityId: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER',
): Promise<CommunityMember> {
  const response = await api.patch<SuccessBody<{ member: CommunityMember }>>(
    `${base(communityId)}/members/${encodeURIComponent(userId)}`,
    { role },
    quiet,
  );
  return response.data.data.member;
}

export async function transferOwnership(
  communityId: string,
  userId: string,
): Promise<PublicCommunity> {
  const response = await api.post<SuccessBody<{ community: PublicCommunity }>>(
    `${base(communityId)}/ownership`,
    { userId },
    quiet,
  );
  return response.data.data.community;
}

export async function unblockUser(communityId: string, userId: string): Promise<void> {
  await api.delete(`${base(communityId)}/bans/${encodeURIComponent(userId)}`, quiet);
}

export async function updateCommunity(
  communityId: string,
  changes: CommunityChanges,
): Promise<PublicCommunity> {
  const response = await api.patch<SuccessBody<{ community: PublicCommunity }>>(
    base(communityId),
    changes,
    quiet,
  );
  return response.data.data.community;
}

export async function deleteCommunity(communityId: string): Promise<void> {
  await api.delete(base(communityId), quiet);
}
