import type { PublicCommunity } from './communities';
import { api, type SuccessBody } from './client';
import { cacheKeys as K } from '../lib/cacheKeys';
import { invalidate } from '../lib/requestCache';

export interface Invite {
  token: string;
}

/** Mirrors the backend's InvitePreview: what a link holder sees before joining. */
export interface InvitePreview {
  communityId: string;
  name: string;
  /** Loads only for a signed-in viewer; the cover falls back otherwise (community-photo.md D3). */
  photoUrl: string | null;
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
  invalidate([]);
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
  invalidate([K.communities, K.notifications, K.friends]);
  return response.data.data;
}

/** The link an admin shares, built from wherever the app is being served. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}
