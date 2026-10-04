import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homePathFor, useAuthStore } from '../stores/auth';
import { clearPendingInvite, pendingInvite, rememberPendingInvite } from './pendingInvite';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pendingInvite', () => {
  it('remembers, reads and clears an invite path', () => {
    // Act
    rememberPendingInvite('/invite/abc');

    // Assert
    expect(pendingInvite()).toBe('/invite/abc');
    clearPendingInvite();
    expect(pendingInvite()).toBeNull();
  });

  it('ignores a stored value that is not an invite path', () => {
    // Arrange
    sessionStorage.setItem('pendingInvite', 'https://evil.example/');

    // Act & Assert
    expect(pendingInvite()).toBeNull();
  });

  it('tolerates storage that throws (private mode, blocked site data)', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    // Act & Assert
    expect(() => rememberPendingInvite('/invite/abc')).not.toThrow();
    expect(pendingInvite()).toBeNull();
    expect(() => clearPendingInvite()).not.toThrow();
  });
});

describe('homePathFor with a pending invite', () => {
  it('sends an onboarded user back to the invite instead of the dashboard', () => {
    // Arrange
    rememberPendingInvite('/invite/abc');

    // Act & Assert
    expect(homePathFor(false)).toBe('/invite/abc');
    expect(homePathFor(true)).toBe('/onboarding');
  });

  it('falls back to the dashboard when there is none', () => {
    // Act & Assert
    expect(homePathFor(false)).toBe('/home');
  });

  it('keeps the pending invite when the session is cleared by a 401 — a signed-out visitor still needs it', () => {
    // Arrange
    rememberPendingInvite('/invite/abc');

    // Act
    useAuthStore.getState().clear();

    // Assert
    expect(pendingInvite()).toBe('/invite/abc');
  });
});
