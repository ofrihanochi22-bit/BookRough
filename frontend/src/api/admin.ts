import { api, type SuccessBody } from './client';
import type { StreamingService } from '../stores/auth';
import { AVATAR_KEYS, cacheKeys as K, DELETION_KEYS } from '../lib/cacheKeys';
import { invalidate } from '../lib/requestCache';

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
  photoUrl: string | null;
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

/** The one write on users: remove a photo (avatar-upload.md §4). The caller toasts. */
export async function removeUserPhoto(userId: string): Promise<AdminUser> {
  const response = await api.delete<SuccessBody<{ user: AdminUser }>>(
    `/admin/users/${encodeURIComponent(userId)}/avatar`,
    { skipErrorToast: true },
  );
  invalidate([...AVATAR_KEYS]);
  return response.data.data.user;
}

/** The site admin removes a community's photo (community-photo.md D2). */
export async function removeAdminCommunityPhoto(communityId: string): Promise<AdminCommunity> {
  const response = await api.delete<SuccessBody<{ community: AdminCommunity }>>(
    `/admin/communities/${encodeURIComponent(communityId)}/photo`,
    { skipErrorToast: true },
  );
  invalidate([K.communities, K.community(communityId), K.feed(communityId)]);
  return response.data.data.community;
}

/** Mirrors the backend's UserDeletionPreview (docs/features/admin-delete.md §4). */
export interface UserDeletionPreview {
  displayName: string | null;
  counts: { posts: number; ratings: number; comments: number };
  communities: {
    id: string;
    name: string;
    outcome: 'TRANSFER' | 'DELETE';
    newOwner?: { id: string; displayName: string | null };
  }[];
}

/** What the "Are you sure?" dialog shows. The dialog shows its own error, so no toast. */
export async function fetchUserDeletionPreview(userId: string): Promise<UserDeletionPreview> {
  const response = await api.get<SuccessBody<{ preview: UserDeletionPreview }>>(
    `/admin/users/${encodeURIComponent(userId)}/deletion-preview`,
    { skipErrorToast: true },
  );
  return response.data.data.preview;
}

/** Deletes a user for good (admin-delete.md §4). The dialog shows its own error. */
export async function deleteAdminUser(userId: string): Promise<void> {
  await api.delete(`/admin/users/${encodeURIComponent(userId)}`, { skipErrorToast: true });
  invalidate([...DELETION_KEYS]);
}

/** Deletes a community for good; its members are told (admin-delete.md §4). */
export async function deleteAdminCommunity(communityId: string): Promise<void> {
  await api.delete(`/admin/communities/${encodeURIComponent(communityId)}`, {
    skipErrorToast: true,
  });
  invalidate([...DELETION_KEYS]);
}

export async function listAdminCommunities(): Promise<AdminCommunity[]> {
  const response = await api.get<SuccessBody<{ communities: AdminCommunity[] }>>(
    '/admin/communities',
    { skipErrorToast: true },
  );
  return response.data.data.communities;
}

/** Mirrors the backend's AdminOverview (docs/features/admin-overview.md §4.1). */
export type OverviewStatus = 'ok' | 'watch' | 'stop';

export interface OpenCounts {
  signedIn: number;
  signedOut: number;
}

export interface StorageMeter {
  usedBytes: number;
  limitBytes: number;
  pct: number;
  status: OverviewStatus;
  changeBytes: number | null;
}

export type DeploymentVerdict =
  'keep (live)' | 'keep (rollback)' | 'keep (unfinished)' | 'keep' | 'delete';

export interface AdminOverview {
  generatedAt: string;
  app: {
    users: { total: number; onboarded: number };
    communities: number;
    posts: { community: number; direct: number };
    ratings: number;
    comments: number;
    opens: {
      today: OpenCounts;
      last7Days: OpenCounts;
      last30Days: OpenCounts;
      countingSince: string | null;
    };
  };
  database: { usedBytes: number; limitBytes: number; pct: number; status: OverviewStatus };
  vercel: {
    usage: {
      capturedAt: string;
      stale: boolean;
      period: string | null;
      storage: Record<'functions' | 'images' | 'deployment', StorageMeter>;
      others: { name: string; pct: number; status: OverviewStatus }[];
      highestOther: { name: string; pct: number } | null;
    } | null;
    deployments: {
      capturedAt: string;
      stale: boolean;
      dryRun: boolean;
      liveId: string;
      items: {
        id: string;
        sha: string | null;
        createdAt: string;
        state: string;
        verdict: DeploymentVerdict;
        deleted: boolean;
        imageSizeBytes: number | null;
      }[];
    } | null;
    images: {
      capturedAt: string;
      stale: boolean;
      items: {
        tags: string[];
        digest: string;
        sizeBytes: number;
        publishedAt: string | null;
        inUse: boolean;
      }[];
      totalBytes: number;
    } | null;
    lastDeletion: {
      deployments: { at: string; count: number } | null;
      images: { at: string; count: number } | null;
    };
  };
}

/** The Overview tab shows its own error state (and NotFound on 403), so no toast. */
export async function fetchAdminOverview(): Promise<AdminOverview> {
  const response = await api.get<SuccessBody<AdminOverview>>('/admin/overview', {
    skipErrorToast: true,
  });
  return response.data.data;
}
