import { act, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEY } from '../lib/sessionSnapshot';
import { LOADING_HINT_DELAY_MS, LOADING_HINT_TEXT } from './ui/LoadingHint';

const { fetchSession } = vi.hoisted(() => ({ fetchSession: vi.fn() }));
vi.mock('../api/auth', () => ({ fetchSession }));

const USER = {
  id: 'u1',
  displayName: 'Ofri',
  profilePictureUrl: null,
  preferredService: 'SPOTIFY' as const,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', AxiosError.ERR_BAD_RESPONSE, config, null, {
    data: {},
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  });
}

/**
 * Loads a fresh store and gate, so the saved session is read as on a real app
 * load (client-cache.md §3.3).
 */
async function renderGate() {
  vi.resetModules();
  const { SessionGate } = await import('./RouteGuards');
  const { useAuthStore } = await import('../stores/auth');
  render(
    <SessionGate>
      <p>The app</p>
    </SessionGate>,
  );
  return useAuthStore;
}

function saveSnapshot(): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ user: USER, needsOnboarding: false, isAdmin: false }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionGate with a saved session (client-cache.md §3.3)', () => {
  it('renders the app at once and checks /auth/me behind it', async () => {
    // Arrange
    saveSnapshot();
    fetchSession.mockReturnValue(new Promise(() => {}));

    // Act
    await renderGate();

    // Assert
    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("replaces the saved session with the server's answer", async () => {
    // Arrange
    saveSnapshot();
    fetchSession.mockResolvedValue({
      user: { ...USER, displayName: 'Ofri H' },
      needsOnboarding: false,
      isAdmin: false,
    });

    // Act
    const store = await renderGate();

    // Assert
    await waitFor(() => expect(store.getState().user?.displayName).toBe('Ofri H'));
  });

  it('signs out when /auth/me answers 401', async () => {
    // Arrange
    saveSnapshot();
    fetchSession.mockRejectedValue(httpError(401));

    // Act
    const store = await renderGate();

    // Assert
    await waitFor(() => expect(store.getState().status).toBe('signedOut'));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['no response', new AxiosError('Network Error', AxiosError.ERR_NETWORK)],
    ['a 5xx', httpError(503)],
  ])('keeps the app rendered on %s, with no retry screen', async (_label, error) => {
    // Arrange
    saveSnapshot();
    fetchSession.mockRejectedValue(error);

    // Act
    const store = await renderGate();
    await act(async () => {});

    // Assert
    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(store.getState().status).toBe('signedIn');
  });
});

describe('SessionGate without a saved session', () => {
  it('shows the spinner, then the app once /auth/me answers', async () => {
    // Arrange
    fetchSession.mockResolvedValue({ user: USER, needsOnboarding: false, isAdmin: false });

    // Act
    await renderGate();

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
  });

  it('shows the still-loading line only after 2 seconds', async () => {
    // Arrange
    vi.useFakeTimers();
    fetchSession.mockReturnValue(new Promise(() => {}));
    await renderGate();
    expect(screen.queryByText(LOADING_HINT_TEXT)).not.toBeInTheDocument();

    // Act
    act(() => vi.advanceTimersByTime(LOADING_HINT_DELAY_MS));

    // Assert
    expect(screen.getByText(LOADING_HINT_TEXT)).toBeInTheDocument();
  });

  it('offers Try again when the server cannot be reached, and retries', async () => {
    // Arrange
    fetchSession.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce({
      user: USER,
      needsOnboarding: false,
      isAdmin: false,
    });
    await renderGate();
    const retry = await screen.findByRole('button', { name: 'Try again' });

    // Act
    act(() => retry.click());

    // Assert
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(fetchSession).toHaveBeenCalledTimes(2);
  });
});
