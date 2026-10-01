import type { User } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { needsOnboarding, sessionPayload, toPublicUser } from './publicUser.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'a3b0c6a2-3c55-4d0f-8f7e-1d9a6c2e5b10',
    googleSub: '109876543210987654321',
    displayName: 'Ofri H.',
    displayNameKey: 'ofri h.',
    profilePictureUrl: 'https://lh3.googleusercontent.com/a/photo',
    useGooglePicture: false,
    preferredService: 'SPOTIFY',
    role: 'ADMIN',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T11:00:00.000Z'),
    ...overrides,
  };
}

describe('toPublicUser', () => {
  it('returns exactly the five public fields, so a new column cannot leak', () => {
    // Act
    const publicUser = toPublicUser(makeUser());

    // Assert
    expect(Object.keys(publicUser).sort()).toEqual(
      ['createdAt', 'displayName', 'id', 'preferredService', 'profilePictureUrl'].sort(),
    );
  });

  it('never exposes the Google sub, the uniqueness key, or the role', () => {
    // Act
    const serialised = JSON.stringify(toPublicUser(makeUser()));

    // Assert
    expect(serialised).not.toContain('109876543210987654321');
    expect(serialised).not.toContain('ofri h.');
    expect(serialised).not.toContain('ADMIN');
  });

  it('serialises createdAt as ISO 8601', () => {
    // Act & Assert
    expect(toPublicUser(makeUser()).createdAt).toBe('2026-10-01T10:00:00.000Z');
  });
});

describe('needsOnboarding', () => {
  it('is false once display name and service are both set', () => {
    // Act & Assert
    expect(needsOnboarding(makeUser())).toBe(false);
  });

  it('is true without a display name', () => {
    // Act & Assert
    expect(needsOnboarding(makeUser({ displayName: null }))).toBe(true);
  });

  it('is true without a preferred service', () => {
    // Act & Assert
    expect(needsOnboarding(makeUser({ preferredService: null }))).toBe(true);
  });
});

describe('sessionPayload', () => {
  it('pairs the public user with its onboarding state', () => {
    // Arrange
    const user = makeUser({ displayName: null });

    // Act
    const payload = sessionPayload(user);

    // Assert
    expect(payload).toEqual({ user: toPublicUser(user), needsOnboarding: true });
  });
});
