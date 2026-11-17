import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore, setOnline } from '../test/fixtures';
import { useOnlineStatus } from './useOnlineStatus';

function goOnline(online: boolean) {
  setOnline(online);
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => {
  setOnline(true);
  resetAuthStore();
});

describe('useOnlineStatus', () => {
  it('follows the browser', () => {
    // Arrange
    setOnline(true);
    const { result } = renderHook(useOnlineStatus);
    expect(result.current).toBe(true);

    // Act & Assert
    act(() => goOnline(false));
    expect(result.current).toBe(false);
    act(() => goOnline(true));
    expect(result.current).toBe(true);
  });

  it('is false while the session is unconfirmed, whatever the browser says', () => {
    // Arrange
    setOnline(true);
    useAuthStore.getState().setSession(makeSession(), { offline: true });

    // Act
    const { result } = renderHook(useOnlineStatus);

    // Assert
    expect(result.current).toBe(false);

    // Act
    act(() => useAuthStore.getState().setSession(makeSession()));

    // Assert
    expect(result.current).toBe(true);
  });
});
