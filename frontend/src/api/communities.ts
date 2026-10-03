import { api } from './client';

interface SuccessBody<T> {
  status: 'success';
  data: T;
}

export type CommunityRole = 'ADMIN' | 'MEMBER';

/** Mirrors the backend's PublicCommunity — the only community shape the API sends. */
export interface PublicCommunity {
  id: string;
  name: string;
  description: string | null;
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
