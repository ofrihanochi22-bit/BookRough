import type { Community } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { toPublicCommunity } from './publicCommunity.js';

describe('toPublicCommunity', () => {
  it('returns exactly the six public fields — never the invite token or updatedAt', () => {
    // Arrange
    const community = {
      id: 'community-1',
      name: 'Friday Jazz',
      description: null,
      createdAt: new Date('2026-10-03T09:00:00.000Z'),
      updatedAt: new Date('2026-10-03T10:00:00.000Z'),
      // A secret column: it must never reach a client.
      inviteToken: 'secret-token',
    } satisfies Community;

    // Act
    const result = toPublicCommunity(community, 3, 'MEMBER');

    // Assert
    expect(result).toStrictEqual({
      id: 'community-1',
      name: 'Friday Jazz',
      description: null,
      memberCount: 3,
      myRole: 'MEMBER',
      createdAt: '2026-10-03T09:00:00.000Z',
    });
  });
});
