import { api, type SuccessBody } from './client';
import { cacheKeys as K } from '../lib/cacheKeys';
import { invalidate } from '../lib/requestCache';

export type CommunityRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/** Mirrors the backend's PublicCommunity — the only community shape the API sends. */
export interface PublicCommunity {
  id: string;
  name: string;
  description: string | null;
  /** The uploaded photo's versioned URL, or null for the generated cover (community-photo.md §4). */
  photoUrl: string | null;
  memberCount: number;
  myRole: CommunityRole;
  createdAt: string;
}

export interface NewCommunity {
  name: string;
  description: string | null;
}

/** The form shows its own errors, so the global toast is skipped. */
export async function createCommunity(input: NewCommunity): Promise<PublicCommunity> {
  const response = await api.post<SuccessBody<{ community: PublicCommunity }>>(
    '/communities',
    input,
    { skipErrorToast: true },
  );
  invalidate([K.communities]);
  return response.data.data.community;
}

/** The dashboard shows an inline retry on failure, so no toast. */
export async function listMyCommunities(): Promise<PublicCommunity[]> {
  const response = await api.get<SuccessBody<{ communities: PublicCommunity[] }>>('/communities', {
    skipErrorToast: true,
  });
  return response.data.data.communities;
}

/** A 404 renders the not-found page and other failures an inline retry, so no toast. */
export async function getCommunity(id: string): Promise<PublicCommunity> {
  const response = await api.get<SuccessBody<{ community: PublicCommunity }>>(
    `/communities/${encodeURIComponent(id)}`,
    { skipErrorToast: true },
  );
  return response.data.data.community;
}

/**
 * Uploads a prepared image as the raw body; returns the refreshed community
 * (community-photo.md §4). The screens show their own errors, so no toast.
 */
export async function uploadCommunityPhoto(
  communityId: string,
  image: Blob,
): Promise<PublicCommunity> {
  const response = await api.put<SuccessBody<{ community: PublicCommunity }>>(
    `/communities/${encodeURIComponent(communityId)}/photo`,
    image,
    { headers: { 'Content-Type': image.type }, skipErrorToast: true },
  );
  // Every cached view that shows the community's cover.
  invalidate([K.communities, K.community(communityId), K.feed(communityId)]);
  return response.data.data.community;
}

/** Back to the generated cover; returns the refreshed community. */
export async function removeCommunityPhoto(communityId: string): Promise<PublicCommunity> {
  const response = await api.delete<SuccessBody<{ community: PublicCommunity }>>(
    `/communities/${encodeURIComponent(communityId)}/photo`,
    { skipErrorToast: true },
  );
  // Every cached view that shows the community's cover.
  invalidate([K.communities, K.community(communityId), K.feed(communityId)]);
  return response.data.data.community;
}
