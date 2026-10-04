import type { Community } from '@prisma/client';

/** What a link holder learns about a community before joining — nothing more. */
export interface InvitePreview {
  communityId: string;
  name: string;
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
    memberCount,
    alreadyMember,
  };
}
