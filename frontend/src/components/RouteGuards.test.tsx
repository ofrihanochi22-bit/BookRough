import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSessionSnapshot, saveSessionSnapshot } from '../lib/sessionSnapshot';
import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore, setOnline } from '../test/fixtures';
import { SessionGate } from './RouteGuards';

const { fetchSession } = vi.hoisted(() => ({ fetchSession: vi.fn() }));
vi.mock('../api/auth', () => ({ fetchSession }));

const OFFLINE = "You're offline. Connect to open BookRough.";
const UNREACHABLE = "Can't reach BookRough right now. Check your connection and try again.";

const noResponse = () => new AxiosError('Network Error', 'ERR_NETWORK');

function answered(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(String(status), 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: undefined,
  });
}

const store = () => useAuthStore.getState();

function renderGate() {
  return render(
    <SessionGate>
      <p>The app</p>
    </SessionGate>,
  );
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  setOnline(true);
  setVisibility('visible');
  resetAuthStore();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetAuthStore();
});

describe('SessionGate — opening with no connection', () => {
  it('opens read-only from the remembered session', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(noResponse());

    // Act
    renderGate();

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(store()).toMatchObject({ status: 'signedIn', offline: true });
  });

  it('with no remembered session shows the offline screen, with Try again', async () => {
    // Arrange
    fetchSession.mockRejectedValueOnce(noResponse()).mockResolvedValueOnce(makeSession());
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent(OFFLINE);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(store().offline).toBe(false);
  });

  it('retries by itself when the connection returns', async () => {
    // Arrange
    fetchSession.mockRejectedValueOnce(noResponse()).mockResolvedValueOnce(makeSession());
    renderGate();
    await screen.findByRole('alert');

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(store()).toMatchObject({ status: 'signedIn', offline: false });
  });

  it('a 401 signs out, and removes the remembered session', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(answered(401));

    // Act
    renderGate();

    // Assert
    await waitFor(() => expect(store().status).toBe('signedOut'));
    expect(readSessionSnapshot()).toBeNull();
  });

  it('a 503 is an answer: the retry screen, with the snapshot unused and kept', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(answered(503));

    // Act
    renderGate();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE);
    expect(store().status).toBe('unknown');
    expect(readSessionSnapshot()).not.toBeNull();
  });
});

describe('SessionGate — confirming a remembered session', () => {
  async function openFromSnapshot() {
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValueOnce(noResponse());
    renderGate();
    await screen.findByText('The app');
  }

  it('confirms when the connection returns', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockResolvedValueOnce(makeSession());

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    await waitFor(() => expect(store().offline).toBe(false));
  });

  it('signs out when the reconnect answers 401', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockRejectedValueOnce(answered(401));

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    await waitFor(() => expect(store().status).toBe('signedOut'));
    expect(readSessionSnapshot()).toBeNull();
  });

  it('stays read-only when the check fails again', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockRejectedValueOnce(noResponse());

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    await waitFor(() => expect(fetchSession).toHaveBeenCalledTimes(2));
    expect(store()).toMatchObject({ status: 'signedIn', offline: true });
  });

  it('confirms on returning to the foreground', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockResolvedValueOnce(makeSession());

    // Act
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Assert
    await waitFor(() => expect(store().offline).toBe(false));
  });

  it('asks nothing while the browser is offline, or the app is in the background', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockClear();

    // Act
    setOnline(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    setOnline(true);
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Assert
    expect(fetchSession).not.toHaveBeenCalled();
  });

  it('asks again every 15 seconds, one request at a time', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await openFromSnapshot();
    fetchSession.mockClear();
    fetchSession.mockReturnValue(new Promise(() => {}));

    // Act
    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    // Assert
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it('stops asking once confirmed', async () => {
    // Arrange
    await openFromSnapshot();
    fetchSession.mockResolvedValueOnce(makeSession());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(store().offline).toBe(false));
    fetchSession.mockClear();

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    expect(fetchSession).not.toHaveBeenCalled();
  });
});
