import type { Community } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { toInvitePreview } from './invitePreview.js';

describe('toInvitePreview', () => {
  it('returns exactly the four public fields — never the token or the description', () => {
    // Arrange
    const community: Community = {
      id: 'community-1',
      name: 'Friday Jazz',
      description: 'Members-only rules',
      inviteToken: 'secret-token',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Act
    const result = toInvitePreview(community, 3, true);

    // Assert
    expect(result).toStrictEqual({
      communityId: 'community-1',
      name: 'Friday Jazz',
      memberCount: 3,
      alreadyMember: true,
    });
  });
});
