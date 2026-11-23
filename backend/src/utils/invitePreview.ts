import type { Community } from '@prisma/client';

import { communityPhotoUrl } from './communityPhotoUrl.js';

/** What a link holder learns about a community before joining — nothing more. */
export interface InvitePreview {
  communityId: string;
  name: string;
  /** Only a path: a signed-out visitor's request for it gets 401 (community-photo.md D3). */
  photoUrl: string | null;
  memberCount: number;
  alreadyMember: boolean;
}

/**
 * Field by field, like the other serialisers: no description, no member names,
 * and never the token itself.
 */
export function toInvitePreview(
  community: Community,
  memberCount: number,
  alreadyMember: boolean,
): InvitePreview {
  return {
    communityId: community.id,
    name: community.name,
    photoUrl: communityPhotoUrl(community.id, community.photoUpdatedAt),
    memberCount,
    alreadyMember,
  };
}
