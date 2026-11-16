import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSession, makeUser } from '../test/fixtures';
import {
  readSessionSnapshot,
  removeSessionSnapshot,
  saveSessionSnapshot,
  SESSION_STORAGE_KEY as KEY,
} from './sessionSnapshot';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the remembered session', () => {
  it('reads back what was saved', () => {
    // Arrange
    const session = makeSession({ isAdmin: true });

    // Act
    saveSessionSnapshot(session);

    // Assert
    expect(readSessionSnapshot()).toEqual(session);
  });

  it('keeps a user mid-onboarding, whose profile fields are null', () => {
    // Arrange
    const session = makeSession({
      user: makeUser({ displayName: null, preferredService: null, profilePictureUrl: null }),
      needsOnboarding: true,
    });

    // Act
    saveSessionSnapshot(session);

    // Assert
    expect(readSessionSnapshot()).toEqual(session);
  });

  it('stores only the session fields', () => {
    // Arrange
    const session = { ...makeSession(), token: 'secret' };

    // Act
    saveSessionSnapshot(session);

    // Assert
    expect(Object.keys(JSON.parse(window.localStorage.getItem(KEY)!) as object).sort()).toEqual([
      'isAdmin',
      'needsOnboarding',
      'user',
    ]);
  });

  it('is null when nothing was saved', () => {
    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it('remove deletes it', () => {
    // Arrange
    saveSessionSnapshot(makeSession());

    // Act
    removeSessionSnapshot();

    // Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it('treats malformed JSON as none', () => {
    // Arrange
    window.localStorage.setItem(KEY, '{ nope');

    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it.each([
    ['a null', null],
    ['a number', 7],
    ['no user', { needsOnboarding: false, isAdmin: false }],
    ['a null user', { user: null, needsOnboarding: false, isAdmin: false }],
    [
      'a user with no id',
      { user: { displayName: 'Dana' }, needsOnboarding: false, isAdmin: false },
    ],
  ])('ignores a snapshot that is %s', (_label, value) => {
    // Arrange
    window.localStorage.setItem(KEY, JSON.stringify(value));

    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it('ignores a snapshot whose createdAt is not a string', () => {
    // Arrange
    const session = makeSession();
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...session, user: { ...session.user, createdAt: null } }),
    );

    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it.each(['needsOnboarding', 'isAdmin'])('ignores a snapshot with no %s', (field) => {
    // Arrange
    const { [field as 'isAdmin']: _dropped, ...rest } = makeSession();
    window.localStorage.setItem(KEY, JSON.stringify(rest));

    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it('counts storage that throws on read as no snapshot', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    // Act & Assert
    expect(readSessionSnapshot()).toBeNull();
  });

  it('ignores storage that throws on write and on delete', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    // Act & Assert
    expect(() => saveSessionSnapshot(makeSession())).not.toThrow();
    expect(() => removeSessionSnapshot()).not.toThrow();
  });
});
