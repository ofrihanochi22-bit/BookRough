import { api, type SuccessBody } from './client';
import type { StreamingService } from '../stores/auth';

/** Mirrors the backend's AdminUser (docs/features/admin-panel.md §4.2). */
export interface AdminUser {
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  preferredService: StreamingService | null;
  createdAt: string;
  onboarded: boolean;
  isAdmin: boolean;
  communityCount: number;
}

/** Mirrors the backend's AdminCommunity (§4.3). */
export interface AdminCommunity {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  owner: { id: string; displayName: string | null } | null;
}

/** The screen shows its own error state (and NotFound on 403), so no toast. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await api.get<SuccessBody<{ users: AdminUser[] }>>('/admin/users', {
    skipErrorToast: true,
  });
  return response.data.data.users;
}

export async function listAdminCommunities(): Promise<AdminCommunity[]> {
  const response = await api.get<SuccessBody<{ communities: AdminCommunity[] }>>(
    '/admin/communities',
    { skipErrorToast: true },
  );
  return response.data.data.communities;
}
