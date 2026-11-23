import type { Community } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { toInvitePreview } from './invitePreview.js';

describe('toInvitePreview', () => {
  it('returns exactly the five public fields — never the token or the description', () => {
    // Arrange
    const community: Community = {
      id: 'community-1',
      name: 'Friday Jazz',
      description: 'Members-only rules',
      inviteToken: 'secret-token',
      photoUpdatedAt: new Date('2026-11-22T12:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Act
    const result = toInvitePreview(community, 3, true);

    // Assert
    expect(result).toStrictEqual({
      communityId: 'community-1',
      name: 'Friday Jazz',
      photoUrl: '/api/communities/community-1/photo?v=1795348800000',
      memberCount: 3,
      alreadyMember: true,
    });
  });
});
