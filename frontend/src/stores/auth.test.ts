import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSessionSnapshot } from '../lib/sessionSnapshot';
import { makeSession, makeUser, resetAuthStore } from '../test/fixtures';
import { useAuthStore } from './auth';

const OWNER = 'bookrough.apiCacheOwner';
const store = () => useAuthStore.getState();

function stubCaches() {
  const deleted = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('caches', { delete: deleted });
  return deleted;
}

beforeEach(() => {
  window.localStorage.clear();
  resetAuthStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setSession', () => {
  it('remembers a confirmed session and claims the saved answers', () => {
    // Arrange
    const deleted = stubCaches();
    const session = makeSession();

    // Act
    store().setSession(session);

    // Assert
    expect(store()).toMatchObject({ status: 'signedIn', user: session.user, offline: false });
    expect(readSessionSnapshot()).toEqual(session);
    expect(window.localStorage.getItem(OWNER)).toBe(session.user.id);
    expect(deleted).toHaveBeenCalledWith('api');
  });

  it('deletes the saved answers when a different user signs in on this device', () => {
    // Arrange
    const deleted = stubCaches();
    store().setSession(makeSession({ user: makeUser({ id: 'user-a' }) }));
    deleted.mockClear();

    // Act
    store().setSession(makeSession({ user: makeUser({ id: 'user-b' }) }));

    // Assert
    expect(deleted).toHaveBeenCalledWith('api');
  });

  it('opens a remembered session read-only, and changes nothing on the device', () => {
    // Arrange
    const deleted = stubCaches();
    const session = makeSession();

    // Act
    store().setSession(session, { offline: true });

    // Assert
    expect(store()).toMatchObject({ status: 'signedIn', offline: true });
    expect(readSessionSnapshot()).toBeNull();
    expect(window.localStorage.getItem(OWNER)).toBeNull();
    expect(deleted).not.toHaveBeenCalled();
  });

  it('a confirmation clears the read-only flag', () => {
    // Arrange
    store().setSession(makeSession(), { offline: true });

    // Act
    store().setSession(makeSession());

    // Assert
    expect(store().offline).toBe(false);
  });
});

describe('clear', () => {
  it('leaves nothing of this user on the device', () => {
    // Arrange
    const deleted = stubCaches();
    store().setSession(makeSession());
    deleted.mockClear();

    // Act
    store().clear();

    // Assert
    expect(store()).toMatchObject({ status: 'signedOut', user: null, offline: false });
    expect(readSessionSnapshot()).toBeNull();
    expect(deleted).toHaveBeenCalledWith('api');
  });

  it('still signs out in a browser without Cache Storage', () => {
    // Arrange
    vi.stubGlobal('caches', undefined);
    store().setSession(makeSession());

    // Act
    store().clear();

    // Assert
    expect(store().status).toBe('signedOut');
  });
});

describe('revokeAdmin', () => {
  it('updates the remembered session, so an offline launch cannot restore the role', () => {
    // Arrange
    store().setSession(makeSession({ isAdmin: true }));

    // Act
    store().revokeAdmin();

    // Assert
    expect(store().isAdmin).toBe(false);
    expect(readSessionSnapshot()?.isAdmin).toBe(false);
  });

  it('leaves the snapshot alone while the session is unconfirmed', () => {
    // Arrange
    store().setSession(makeSession({ isAdmin: true }), { offline: true });

    // Act
    store().revokeAdmin();

    // Assert
    expect(store().isAdmin).toBe(false);
    expect(readSessionSnapshot()).toBeNull();
  });
});
