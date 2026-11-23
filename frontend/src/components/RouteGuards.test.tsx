import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { readSessionSnapshot, saveSessionSnapshot } from '../lib/sessionSnapshot';
import type { useAuthStore as AuthStore } from '../stores/auth';
import { makeSession, setOnline } from '../test/fixtures';

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

let auth: typeof AuthStore;
const store = () => auth.getState();

/**
 * Loads a fresh store and gate, so a saved session is read as on a real app
 * load (client-cache.md §3.3), then renders the gate.
 */
async function launch() {
  vi.resetModules();
  const { SessionGate } = await import('./RouteGuards');
  ({ useAuthStore: auth } = await import('../stores/auth'));
  render(
    <SessionGate>
      <p>The app</p>
    </SessionGate>,
  );
}

/**
 * The gate attaches its `online` listener in a passive effect, which React can
 * run a moment after the screen it belongs to is already on the page. An event
 * sent in that gap reaches no one, so a test waits for the listener first.
 */
let addListener: MockInstance<typeof window.addEventListener>;

async function listeningForOnline() {
  await vi.waitFor(() => expect(addListener).toHaveBeenCalledWith('online', expect.any(Function)));
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  setOnline(true);
  setVisibility('visible');
  addListener = vi.spyOn(window, 'addEventListener');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  addListener.mockRestore();
});

describe('SessionGate — opening with no connection', () => {
  it('opens from the saved session, read-only once the check gets no response', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(noResponse());

    // Act
    await launch();

    // Assert
    expect(screen.getByText('The app')).toBeInTheDocument();
    await waitFor(() => expect(store()).toMatchObject({ status: 'signedIn', offline: true }));
  });

  it('with a saved session, a 503 keeps the app open and writable', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(answered(503));

    // Act
    await launch();

    // Assert
    await waitFor(() => expect(fetchSession).toHaveBeenCalledTimes(1));
    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(store()).toMatchObject({ status: 'signedIn', offline: false });
    expect(readSessionSnapshot()).not.toBeNull();
  });

  it('with no saved session shows the offline screen, with Try again', async () => {
    // Arrange
    fetchSession.mockRejectedValueOnce(noResponse()).mockResolvedValueOnce(makeSession());
    await launch();
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
    await launch();
    await screen.findByRole('alert');
    await listeningForOnline();

    // Act
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(store()).toMatchObject({ status: 'signedIn', offline: false });
  });

  it('a 401 signs out, and removes the saved session', async () => {
    // Arrange
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValue(answered(401));

    // Act
    await launch();

    // Assert
    await waitFor(() => expect(store().status).toBe('signedOut'));
    expect(readSessionSnapshot()).toBeNull();
  });

  it('with no saved session, a 503 is an answer: the retry screen', async () => {
    // Arrange
    fetchSession.mockRejectedValue(answered(503));

    // Act
    await launch();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE);
    expect(store().status).toBe('unknown');
  });
});

describe('SessionGate — confirming a saved session', () => {
  async function openUnconfirmed() {
    saveSessionSnapshot(makeSession());
    fetchSession.mockRejectedValueOnce(noResponse());
    await launch();
    // vi.waitFor runs on Vitest's own timers, so it also works under fake ones.
    await vi.waitFor(() => expect(store().offline).toBe(true));
    await listeningForOnline();
  }

  it('confirms when the connection returns', async () => {
    // Arrange
    await openUnconfirmed();
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
    await openUnconfirmed();
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
    await openUnconfirmed();
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
    await openUnconfirmed();
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
    await openUnconfirmed();
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
    await openUnconfirmed();
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
    await openUnconfirmed();
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
