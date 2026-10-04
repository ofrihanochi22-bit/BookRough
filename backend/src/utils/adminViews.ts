import type { StreamingService } from '@prisma/client';

/**
 * The admin area's only shapes (docs/features/admin-panel.md §4). Field by
 * field, never a spread: `googleSub`, `displayNameKey`, `useGooglePicture` (read, never sent) and
 * `updatedAt` never leave the server, and there is no email to leak
 * (CLAUDE.md §5).
 */
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

export interface AdminCommunity {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  owner: { id: string; displayName: string | null } | null;
}

export function toAdminUser(user: {
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  useGooglePicture: boolean;
  preferredService: StreamingService | null;
  createdAt: Date;
  role: 'USER' | 'ADMIN';
  _count: { memberships: number };
}): AdminUser {
  return {
    id: user.id,
    displayName: user.displayName,
    // Before onboarding the column holds a photo kept only to be offered; it
    // is shown only once the user has chosen it (docs/features/onboarding.md §3).
    profilePictureUrl: user.useGooglePicture ? user.profilePictureUrl : null,
    preferredService: user.preferredService,
    createdAt: user.createdAt.toISOString(),
    onboarded: user.displayName !== null && user.preferredService !== null,
    isAdmin: user.role === 'ADMIN',
    communityCount: user._count.memberships,
  };
}

export function toAdminCommunity(community: {
  id: string;
  name: string;
  createdAt: Date;
  _count: { members: number };
  members: { user: { id: string; displayName: string | null } }[];
}): AdminCommunity {
  const owner = community.members[0]?.user;
  return {
    id: community.id,
    name: community.name,
    memberCount: community._count.members,
    createdAt: community.createdAt.toISOString(),
    owner: owner ? { id: owner.id, displayName: owner.displayName } : null,
  };
}
