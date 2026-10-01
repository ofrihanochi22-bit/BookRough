import { useAuthStore, type PublicUser, type Session } from '../stores/auth';

export function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: '6f1c1c3e-3b1a-4a52-9f0e-2d7c1b0f4a11',
    displayName: 'Ofri',
    profilePictureUrl: null,
    preferredService: 'SPOTIFY',
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return { user: makeUser(), needsOnboarding: false, ...overrides };
}

/** Back to the app-load state: session not yet resolved. */
export function resetAuthStore(): void {
  useAuthStore.setState({ status: 'unknown', user: null, needsOnboarding: false });
}
