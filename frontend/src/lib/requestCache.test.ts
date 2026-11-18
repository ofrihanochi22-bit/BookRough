import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CACHE_STORAGE_KEY,
  MAX_MEMORY_ENTRIES,
  MAX_PERSISTED_AGE_MS,
  MAX_PERSISTED_ENTRIES,
  cacheSequence,
  flushCacheWrites,
  getCached,
  invalidate,
  setCacheOwner,
  setCached,
  wipeCache,
} from './requestCache';
import { SESSION_STORAGE_KEY } from './sessionSnapshot';

const USER = 'user-1';

/** The saved session naming `userId`, which the cache checks before writing. */
function saveSessionFor(userId: string): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      user: {
        id: userId,
        displayName: 'Ofri',
        profilePictureUrl: null,
        preferredService: 'SPOTIFY',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      needsOnboarding: false,
      isAdmin: false,
    }),
  );
}

function stored(): { userId: string; entries: Record<string, { data: unknown }> } | null {
  const raw = localStorage.getItem(CACHE_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function put(key: string, data: unknown, persist = true): void {
  setCached(key, data, persist, cacheSequence());
}

beforeEach(() => {
  setCacheOwner(null);
  saveSessionFor(USER);
  setCacheOwner(USER);
});

afterEach(() => {
  setCacheOwner(null);
  vi.useRealTimers();
});

describe('requestCache (client-cache.md §3)', () => {
  it('returns an entry from memory', () => {
    // Arrange
    put('communities', [{ id: 'c1' }]);

    // Act
    const cached = getCached('communities');

    // Assert
    expect(cached).toEqual([{ id: 'c1' }]);
  });

  it('writes a persisted key to the device with the user and the time', () => {
    // Arrange
    put('communities', ['a']);

    // Act
    flushCacheWrites();

    // Assert
    expect(stored()).toMatchObject({ userId: USER, entries: { communities: { data: ['a'] } } });
    expect(stored()?.entries.communities).toHaveProperty('savedAt');
  });

  it('does not write a memory-only key to the device', () => {
    // Arrange
    put('post:1', { id: '1' }, false);

    // Act
    flushCacheWrites();

    // Assert
    expect(stored()?.entries ?? {}).toEqual({});
    expect(getCached('post:1')).toEqual({ id: '1' });
  });

  it('coalesces writes and flushes them on its own', () => {
    // Arrange
    vi.useFakeTimers();
    put('communities', ['a']);
    put('myList', ['b']);

    // Act
    vi.runAllTimers();

    // Assert
    expect(Object.keys(stored()?.entries ?? {})).toEqual(
      expect.arrayContaining(['communities', 'myList']),
    );
  });

  it('reads the device copy back when the same user opens the app again', () => {
    // Arrange
    put('communities', ['a']);
    flushCacheWrites();
    setCacheOwner(null);
    saveSessionFor(USER);

    // Act
    setCacheOwner(USER);

    // Assert
    expect(getCached('communities')).toEqual(['a']);
  });

  it('ignores the device copy of another user', () => {
    // Arrange
    put('communities', ['a']);
    flushCacheWrites();
    setCacheOwner(null);

    // Act
    setCacheOwner('user-2');

    // Assert
    expect(getCached('communities')).toBeUndefined();
  });

  it('ignores an entry older than 14 days', () => {
    // Arrange
    localStorage.setItem(
      CACHE_STORAGE_KEY,
      JSON.stringify({
        userId: USER,
        entries: {
          old: { data: 'old', savedAt: Date.now() - MAX_PERSISTED_AGE_MS - 1000 },
          fresh: { data: 'fresh', savedAt: Date.now() },
        },
      }),
    );
    setCacheOwner(null);

    // Act
    setCacheOwner(USER);

    // Assert
    expect(getCached('old')).toBeUndefined();
    expect(getCached('fresh')).toBe('fresh');
  });

  it('ignores corrupt JSON on the device, and the next write replaces it', () => {
    // Arrange
    localStorage.setItem(CACHE_STORAGE_KEY, '{not json');
    setCacheOwner(null);
    setCacheOwner(USER);

    // Act
    put('communities', ['a']);
    flushCacheWrites();

    // Assert
    expect(stored()?.entries.communities?.data).toEqual(['a']);
  });

  it('keeps working from memory when the device refuses the write', () => {
    // Arrange
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    // Act
    put('communities', ['a']);
    flushCacheWrites();

    // Assert
    expect(getCached('communities')).toEqual(['a']);
    setItem.mockRestore();
  });

  it('keeps only the 40 newest persisted entries on the device', () => {
    // Arrange
    vi.useFakeTimers();
    for (let index = 0; index < MAX_PERSISTED_ENTRIES + 5; index += 1) {
      vi.setSystemTime(1_000_000 + index);
      put(`feed:${index}`, index);
    }

    // Act
    flushCacheWrites();

    // Assert
    const keys = Object.keys(stored()?.entries ?? {});
    expect(keys).toHaveLength(MAX_PERSISTED_ENTRIES);
    expect(keys).not.toContain('feed:0');
    expect(keys).toContain(`feed:${MAX_PERSISTED_ENTRIES + 4}`);
  });

  it('evicts the least recently used entry from memory, counting reads', () => {
    // Arrange
    put('first', 1, false);
    for (let index = 0; index < MAX_MEMORY_ENTRIES - 1; index += 1) {
      put(`k:${index}`, index, false);
    }
    getCached('first');

    // Act
    put('one-more', 'x', false);

    // Assert
    expect(getCached('first')).toBe(1);
    expect(getCached('k:0')).toBeUndefined();
  });

  it('refuses to write when the saved session names another user (another tab)', () => {
    // Arrange
    put('communities', ['a']);
    saveSessionFor('user-2');

    // Act
    flushCacheWrites();

    // Assert
    expect(stored()).toBeNull();
  });

  it('invalidates a prefix: feed removes feed:a and feed:b, not communities', () => {
    // Arrange
    put('feed:a', 1);
    put('feed:b', 2);
    put('communities', 3);
    flushCacheWrites();

    // Act
    invalidate(['feed']);
    flushCacheWrites();

    // Assert
    expect(getCached('feed:a')).toBeUndefined();
    expect(getCached('feed:b')).toBeUndefined();
    expect(getCached('communities')).toBe(3);
    expect(Object.keys(stored()?.entries ?? {})).toEqual(['communities']);
  });

  it('invalidates post:1 without touching post:10 or postRatings:1', () => {
    // Arrange
    put('post:1', 1, false);
    put('post:10', 10, false);
    put('postRatings:1', 'r', false);

    // Act
    invalidate(['post:1']);

    // Assert
    expect(getCached('post:1')).toBeUndefined();
    expect(getCached('post:10')).toBe(10);
    expect(getCached('postRatings:1')).toBe('r');
  });

  it('treats an empty invalidation as "nothing changes"', () => {
    // Arrange
    put('communities', 1);
    const before = cacheSequence();

    // Act
    invalidate([]);

    // Assert
    expect(getCached('communities')).toBe(1);
    expect(cacheSequence()).toBe(before);
  });

  it('does not cache an answer whose key was invalidated while it was in flight', () => {
    // Arrange
    const startedAt = cacheSequence();
    invalidate(['feed']);

    // Act
    setCached('feed:a', 'old answer', true, startedAt);

    // Assert
    expect(getCached('feed:a')).toBeUndefined();
  });

  it('still caches an in-flight answer when an unrelated key was invalidated', () => {
    // Arrange
    const startedAt = cacheSequence();
    invalidate(['notifications']);

    // Act
    setCached('feed:a', 'answer', true, startedAt);

    // Assert
    expect(getCached('feed:a')).toBe('answer');
  });

  it('does not cache an in-flight answer once the invalidation log no longer reaches it', () => {
    // Arrange
    const startedAt = cacheSequence();
    for (let index = 0; index < 60; index += 1) {
      invalidate([`other:${index}`]);
    }

    // Act
    setCached('feed:a', 'answer', true, startedAt);

    // Assert
    expect(getCached('feed:a')).toBeUndefined();
  });

  it('does not cache an in-flight answer after a wipe', () => {
    // Arrange
    const startedAt = cacheSequence();
    wipeCache();

    // Act
    setCached('communities', 'answer', true, startedAt);

    // Assert
    expect(getCached('communities')).toBeUndefined();
  });

  it('wipe empties memory and removes the device copy', () => {
    // Arrange
    put('communities', 1);
    flushCacheWrites();

    // Act
    wipeCache();

    // Assert
    expect(getCached('communities')).toBeUndefined();
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull();
  });

  it('wipe succeeds when the device throws', () => {
    // Arrange
    put('communities', 1, false);
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    // Act
    wipeCache();

    // Assert
    expect(getCached('communities')).toBeUndefined();
    removeItem.mockRestore();
  });

  it('writes nothing while no one is signed in', () => {
    // Arrange
    setCacheOwner(null);

    // Act
    put('communities', 1);
    flushCacheWrites();

    // Assert
    expect(stored()).toBeNull();
  });
});
