import { describe, expect, it } from 'vitest';

import { toInviteCandidate, toMyInvitation } from './invitationViews.js';

describe('invitation views', () => {
  it('toInviteCandidate has exactly the three member fields and the status', () => {
    // Arrange: extra fields stand in for a careless select.
    const user = {
      id: 'u1',
      displayName: 'Dana',
      profilePictureUrl: null,
      googleSub: 'sub-dana',
    };

    // Act & Assert
    expect(toInviteCandidate(user, 'INVITED')).toEqual({
      user: { id: 'u1', displayName: 'Dana', profilePictureUrl: null },
      status: 'INVITED',
    });
  });

  it('toMyInvitation has exactly its keys: no token, description or members', () => {
    // Arrange
    const row = {
      createdAt: new Date('2026-10-06T10:00:00.000Z'),
      community: {
        id: 'c1',
        name: 'Crew',
        _count: { members: 3 },
        inviteToken: 'secret',
        description: 'private',
      },
      invitedBy: { id: 'u1', displayName: 'Dana', profilePictureUrl: null, role: 'ADMIN' },
    };

    // Act
    const view = toMyInvitation(row);

    // Assert
    expect(view).toEqual({
      community: { id: 'c1', name: 'Crew', memberCount: 3 },
      invitedBy: { id: 'u1', displayName: 'Dana', profilePictureUrl: null },
      sentAt: '2026-10-06T10:00:00.000Z',
    });
    expect(JSON.stringify(view)).not.toContain('secret');
  });
});
