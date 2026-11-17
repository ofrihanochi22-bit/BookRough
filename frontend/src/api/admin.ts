import { api, type SuccessBody } from './client';
import type { StreamingService } from '../stores/auth';
import { AVATAR_KEYS } from '../lib/cacheKeys';
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
