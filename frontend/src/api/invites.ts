import type { PublicCommunity } from './communities';
import { api, type SuccessBody } from './client';

export interface Invite {
  token: string;
}

/** Mirrors the backend's InvitePreview: what a link holder sees before joining. */
export interface InvitePreview {
  communityId: string;
  name: string;
  memberCount: number;
  alreadyMember: boolean;
}

export interface AcceptResult {
  community: PublicCommunity;
  joined: boolean;
}

// Every screen that calls these shows its own error, so the global toast is skipped.

export async function getInvite(communityId: string): Promise<Invite> {
  const response = await api.get<SuccessBody<{ invite: Invite }>>(
    `/communities/${encodeURIComponent(communityId)}/invite`,
    { skipErrorToast: true },
  );
  return response.data.data.invite;
}

export async function resetInvite(communityId: string): Promise<Invite> {
  const response = await api.post<SuccessBody<{ invite: Invite }>>(
    `/communities/${encodeURIComponent(communityId)}/invite/reset`,
    undefined,
    { skipErrorToast: true },
  );
  return response.data.data.invite;
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const response = await api.get<SuccessBody<{ invite: InvitePreview }>>(
    `/invites/${encodeURIComponent(token)}`,
    { skipErrorToast: true },
  );
  return response.data.data.invite;
}

export async function acceptInvite(token: string): Promise<AcceptResult> {
  const response = await api.post<SuccessBody<AcceptResult>>(
    `/invites/${encodeURIComponent(token)}/accept`,
    undefined,
    { skipErrorToast: true },
  );
  return response.data.data;
}

/** The link an admin shares, built from wherever the app is being served. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}
