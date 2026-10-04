import { describe, expect, it } from 'vitest';

import { isAdmin, memberActions, roleLabel } from './communityRoles';

describe('isAdmin and roleLabel', () => {
  it('treats the owner as an admin and labels each role', () => {
    // Act & Assert
    expect([isAdmin('OWNER'), isAdmin('ADMIN'), isAdmin('MEMBER')]).toEqual([true, true, false]);
    expect([roleLabel('OWNER'), roleLabel('ADMIN'), roleLabel('MEMBER')]).toEqual([
      'Owner',
      'Admin',
      null,
    ]);
  });
});

describe('memberActions — mirrors the server rules (communities-membership.md §5.3)', () => {
  it.each([
    // caller, target, self, actions
    ['OWNER', 'MEMBER', false, ['makeAdmin', 'remove', 'makeOwner']],
    ['OWNER', 'ADMIN', false, ['makeMember', 'makeOwner']],
    ['OWNER', 'OWNER', true, []],
    ['ADMIN', 'MEMBER', false, ['makeAdmin', 'remove']],
    ['ADMIN', 'ADMIN', false, ['makeMember']],
    ['ADMIN', 'ADMIN', true, ['makeMember']],
    ['ADMIN', 'OWNER', false, []],
    ['MEMBER', 'MEMBER', false, []],
    ['MEMBER', 'ADMIN', false, []],
    ['MEMBER', 'MEMBER', true, []],
  ] as const)('%s acting on %s (self: %s) may %j', (caller, target, self, expected) => {
    // Act & Assert
    expect(memberActions(caller, target, self)).toEqual(expected);
  });
});
