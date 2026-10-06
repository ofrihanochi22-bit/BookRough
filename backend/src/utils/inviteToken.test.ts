import { describe, expect, it } from 'vitest';

import { generateInviteToken, hasInviteTokenShape } from './inviteToken.js';
import { redactPath } from './redactPath.js';

describe('generateInviteToken', () => {
  it('returns 22 base64url characters (128 bits), different every time', () => {
    // Act
    const tokens = Array.from({ length: 50 }, generateInviteToken);

    // Assert
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
    expect(new Set(tokens).size).toBe(50);
  });
});

describe('hasInviteTokenShape', () => {
  it.each(['abc', 'A-b_9', 'x'.repeat(64)])('accepts %j', (value) => {
    // Act & Assert
    expect(hasInviteTokenShape(value)).toBe(true);
  });

  it.each(['', 'x'.repeat(65), 'a/b', 'a b', '%%%', 'tok=en', undefined, 42])(
    'rejects %j',
    (value) => {
      // Act & Assert
      expect(hasInviteTokenShape(value)).toBe(false);
    },
  );
});

describe('redactPath', () => {
  it('replaces the token in invite paths and leaves other paths alone', () => {
    // Act & Assert
    expect(redactPath('/api/invites/qEP_iUKg0kWils3eSHVHZQ')).toBe('/api/invites/:token');
    expect(redactPath('/api/invites/qEP_iUKg0kWils3eSHVHZQ/accept?x=1')).toBe(
      '/api/invites/:token/accept?…',
    );
    expect(redactPath('/api/communities/abc/invite')).toBe('/api/communities/abc/invite');
  });
});
