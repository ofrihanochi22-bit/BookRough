import { AxiosError, AxiosHeaders } from 'axios';

import type { PublicCommunity } from '../api/communities';
import type { PublicPost } from '../api/posts';
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
  return { user: makeUser(), needsOnboarding: false, isAdmin: false, ...overrides };
}

/** Back to the app-load state: session not yet resolved. */
export function resetAuthStore(): void {
  useAuthStore.setState({ status: 'unknown', user: null, needsOnboarding: false, isAdmin: false });
}

export function makeCommunity(overrides: Partial<PublicCommunity> = {}): PublicCommunity {
  return {
    id: '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40',
    name: 'Friday Jazz',
    description: null,
    memberCount: 1,
    myRole: 'ADMIN',
    createdAt: '2026-10-03T09:00:00.000Z',
    ...overrides,
  };
}

export function makePost(overrides: Partial<PublicPost> = {}): PublicPost {
  return {
    id: '9a3e1d52-7b4c-4f2a-8e61-3c5d7f9b1a20',
    author: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      displayName: 'Dana',
      profilePictureUrl: null,
    },
    isMine: false,
    canDelete: false,
    originalUrl: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    sourceService: 'SPOTIFY',
    kind: 'TRACK',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    coverArtUrl: 'https://img.example/cover.jpg',
    links: {
      SPOTIFY: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
      APPLE_MUSIC: 'https://music.apple.com/us/album/x/1?i=2',
      DEEZER: 'https://www.deezer.com/track/1',
    },
    comment: null,
    conversionPending: false,
    createdAt: '2026-10-04T10:00:00.000Z',
    isBookmarked: false,
    myScore: null,
    ...overrides,
  };
}

/** A post saved while the converter was unavailable. */
export function makePendingPost(overrides: Partial<PublicPost> = {}): PublicPost {
  return makePost({
    kind: null,
    title: null,
    artist: null,
    coverArtUrl: null,
    links: {},
    conversionPending: true,
    ...overrides,
  });
}

/** An axios error carrying a backend error body, as the API client rejects with. */
export function httpError(status: number, message: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: { status: 'error', code: status, message },
  });
}

/** An axios error with no response at all — offline, DNS, timeout. */
export function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() });
}

export function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}
