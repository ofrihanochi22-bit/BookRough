import { api, type SuccessBody } from './client';
import type { MemberUser } from './membership';

/** Mirrors docs/features/invite-friends.md §4. */
export type CandidateStatus = 'INVITABLE' | 'INVITED' | 'MEMBER' | 'BLOCKED';

export interface InviteCandidate {
  user: MemberUser;
  status: CandidateStatus;
}

export interface MyInvitation {
  community: { id: string; name: string; memberCount: number };
  /** Null once the inviter's account is gone. */
  invitedBy: MemberUser | null;
  sentAt: string;
}

/** Every caller shows its own outcome, so no global error toast. */
const quiet = { skipErrorToast: true } as const;
const path = (id: string) => encodeURIComponent(id);

export async function listCandidates(communityId: string): Promise<InviteCandidate[]> {
  const response = await api.get<SuccessBody<{ candidates: InviteCandidate[] }>>(
    `/communities/${path(communityId)}/invitations/candidates`,
    quiet,
  );
  return response.data.data.candidates;
}

export async function inviteFriends(
  communityId: string,
  userIds: string[],
): Promise<InviteCandidate[]> {
  const response = await api.post<SuccessBody<{ candidates: InviteCandidate[] }>>(
    `/communities/${path(communityId)}/invitations`,
    { userIds },
    quiet,
  );
  return response.data.data.candidates;
}

export async function cancelInvitation(
  communityId: string,
  userId: string,
): Promise<InviteCandidate[]> {
  const response = await api.delete<SuccessBody<{ candidates: InviteCandidate[] }>>(
    `/communities/${path(communityId)}/invitations/${path(userId)}`,
    quiet,
  );
  return response.data.data.candidates;
}

export async function listMyInvitations(): Promise<MyInvitation[]> {
  const response = await api.get<SuccessBody<{ invitations: MyInvitation[] }>>(
    '/invitations',
    quiet,
  );
  return response.data.data.invitations;
}

export async function countMyInvitations(): Promise<number> {
  const response = await api.get<SuccessBody<{ count: number }>>('/invitations/count', quiet);
  return response.data.data.count;
}

export async function acceptInvitation(communityId: string): Promise<void> {
  await api.post(`/invitations/${path(communityId)}/accept`, undefined, quiet);
}

export async function declineInvitation(communityId: string): Promise<void> {
  await api.post(`/invitations/${path(communityId)}/decline`, undefined, quiet);
}
