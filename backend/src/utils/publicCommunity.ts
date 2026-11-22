import type { Community, CommunityRole } from '@prisma/client';

import { communityPhotoUrl } from './communityPhotoUrl.js';

/** The only community shape that ever leaves the server. */
export interface PublicCommunity {
  id: string;
  name: string;
  description: string | null;
  /** The uploaded photo's versioned URL, or null for the generated cover. */
  photoUrl: string | null;
  memberCount: number;
  /** The caller's role — every reader of a community is one of its members. */
  myRole: CommunityRole;
  createdAt: string;
}

/**
 * Field by field, never a spread, like `toPublicUser`: a column added to
 * `communities` later must not reach a client until someone adds it here on
 * purpose. `updatedAt` and the membership rows are deliberately absent.
 */
export function toPublicCommunity(
  community: Community,
  memberCount: number,
  myRole: CommunityRole,
): PublicCommunity {
  return {
    id: community.id,
    name: community.name,
    description: community.description,
    photoUrl: communityPhotoUrl(community.id, community.photoUpdatedAt),
    memberCount,
    myRole,
    createdAt: community.createdAt.toISOString(),
  };
}
