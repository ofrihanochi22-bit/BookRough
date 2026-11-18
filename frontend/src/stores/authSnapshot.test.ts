import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_STORAGE_KEY } from '../lib/requestCache';
import { SESSION_STORAGE_KEY } from '../lib/sessionSnapshot';

/**
 * The saved session is read when the auth store module loads, so each test
 * loads a fresh copy of the store (and of the cache it owns) after arranging
 * localStorage (client-cache.md §3.3).
 */
async function loadStore() {
  vi.resetModules();
  const auth = await import('./auth');
  const cache = await import('../lib/requestCache');
  return { ...auth, cache };
}

const USER = {
  id: 'u1',
  displayName: 'Ofri',
  profilePictureUrl: null,
  preferredService: 'SPOTIFY' as const,
  createdAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saved session (client-cache.md §3.3)', () => {
  it('setSession saves user, onboarding and admin flags, without the tutorial', async () => {
    // Arrange
    const { useAuthStore } = await loadStore();

    // Act
    useAuthStore.getState().setSession({
      user: USER,
      needsOnboarding: false,
      isAdmin: true,
      tutorial: { walkthrough: true, saveTip: true, listTip: true },
    });

    // Assert
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')).toEqual({
      user: USER,
      needsOnboarding: false,
      isAdmin: true,
    });
  });

  it('a store created with a valid snapshot starts signed in as that user', async () => {
    // Arrange
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ user: USER, needsOnboarding: true, isAdmin: false }),
    );

    // Act
    const { useAuthStore, openedFromSnapshot } = await loadStore();

    // Assert
    expect(openedFromSnapshot).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedIn',
      user: USER,
      needsOnboarding: true,
      isAdmin: false,
    });
  });

  it("opening from the snapshot loads that user's cached lists from the device", async () => {
    // Arrange
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ user: USER, needsOnboarding: false, isAdmin: false }),
    );
    localStorage.setItem(
      CACHE_STORAGE_KEY,
      JSON.stringify({
        userId: 'u1',
        entries: { communities: { data: ['c'], savedAt: Date.now() } },
      }),
    );

    // Act
    const { cache } = await loadStore();

    // Assert
    expect(cache.getCached('communities')).toEqual(['c']);
  });

  it.each([
    ['not JSON', '{oops'],
    ['missing the user id', JSON.stringify({ user: {}, needsOnboarding: false, isAdmin: false })],
    ['missing the flags', JSON.stringify({ user: USER })],
    ['null', 'null'],
  ])('ignores a malformed snapshot (%s): the store starts unknown', async (_label, value) => {
    // Arrange
    localStorage.setItem(SESSION_STORAGE_KEY, value);

    // Act
    const { useAuthStore, openedFromSnapshot } = await loadStore();

    // Assert
    expect(openedFromSnapshot).toBe(false);
    expect(useAuthStore.getState().status).toBe('unknown');
  });

  it('clear removes the snapshot and wipes the cache', async () => {
    // Arrange
    const { useAuthStore, cache } = await loadStore();
    useAuthStore.getState().setSession({ user: USER, needsOnboarding: false, isAdmin: false });
    cache.setCached('communities', ['c'], true, cache.cacheSequence());
    cache.flushCacheWrites();

    // Act
    useAuthStore.getState().clear();

    // Assert
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull();
    expect(cache.getCached('communities')).toBeUndefined();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('clear still signs out when the device throws', async () => {
    // Arrange
    const { useAuthStore } = await loadStore();
    useAuthStore.getState().setSession({ user: USER, needsOnboarding: false, isAdmin: false });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    // Act
    useAuthStore.getState().clear();

    // Assert
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('setSession still signs in when the device refuses the snapshot', async () => {
    // Arrange
    const { useAuthStore } = await loadStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    // Act
    useAuthStore.getState().setSession({ user: USER, needsOnboarding: false, isAdmin: false });

    // Assert
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it("a different user signing in never sees the previous user's cached lists", async () => {
    // Arrange
    const { useAuthStore, cache } = await loadStore();
    useAuthStore.getState().setSession({ user: USER, needsOnboarding: false, isAdmin: false });
    cache.setCached('communities', ['first user'], true, cache.cacheSequence());

    // Act
    useAuthStore
      .getState()
      .setSession({ user: { ...USER, id: 'u2' }, needsOnboarding: false, isAdmin: false });

    // Assert
    expect(cache.getCached('communities')).toBeUndefined();
  });
});
