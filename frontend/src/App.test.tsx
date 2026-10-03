import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { makeSession, makeUser, resetAuthStore } from './test/fixtures';

const { fetchSession, signInWithGoogle, logout } = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('./api/auth', () => ({ fetchSession, signInWithGoogle, logout }));
// The dashboard loads communities on mount; an empty list keeps routing tests about routing.
const { listMyCommunities } = vi.hoisted(() => ({ listMyCommunities: vi.fn() }));
vi.mock('./api/communities', () => ({ listMyCommunities }));

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential: string }) => void }) => (
    <button onClick={() => onSuccess({ credential: 'id-token' })}>Continue with Google</button>
  ),
}));

function unauthorized(): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: undefined,
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const welcomeHeading = () => screen.findByRole('heading', { name: 'BookRough' });

beforeEach(() => {
  resetAuthStore();
  vi.resetAllMocks();
  listMyCommunities.mockResolvedValue([]);
});

describe('session bootstrap', () => {
  it('shows a spinner, never Welcome, while the session is unresolved', () => {
    // Arrange
    fetchSession.mockReturnValue(new Promise(() => {}));

    // Act
    renderAt('/');

    // Assert
    expect(screen.getByText('Opening BookRough…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'BookRough' })).not.toBeInTheDocument();
  });

  it('shows Welcome when /auth/me answers 401', async () => {
    // Arrange
    fetchSession.mockRejectedValue(unauthorized());

    // Act
    renderAt('/');

    // Assert
    expect(await welcomeHeading()).toBeInTheDocument();
  });

  it('offers a retry instead of signing the user out when the API is unreachable', async () => {
    // Arrange
    fetchSession
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
      .mockResolvedValueOnce(makeSession());
    renderAt('/home');
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach BookRough right now.");

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Your communities' })).toBeInTheDocument();
    expect(fetchSession).toHaveBeenCalledTimes(2);
  });
});

describe('route guards', () => {
  it('sends a signed-out visitor from /home to Welcome', async () => {
    // Arrange
    fetchSession.mockRejectedValue(unauthorized());

    // Act
    renderAt('/home');

    // Assert
    expect(await welcomeHeading()).toBeInTheDocument();
  });

  it('sends a signed-in user who needs onboarding from / to Complete your profile', async () => {
    // Arrange
    fetchSession.mockResolvedValue(
      makeSession({ user: makeUser({ displayName: null }), needsOnboarding: true }),
    );

    // Act
    renderAt('/');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Complete your profile' }),
    ).toBeInTheDocument();
  });

  it('sends an onboarded user from / to home', async () => {
    // Arrange
    fetchSession.mockResolvedValue(makeSession());

    // Act
    renderAt('/');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Your communities' })).toBeInTheDocument();
  });

  it('keeps a user who needs onboarding off /home', async () => {
    // Arrange
    fetchSession.mockResolvedValue(
      makeSession({ user: makeUser({ displayName: null }), needsOnboarding: true }),
    );

    // Act
    renderAt('/home');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Complete your profile' }),
    ).toBeInTheDocument();
  });

  it('sends an onboarded user away from /onboarding', async () => {
    // Arrange
    fetchSession.mockResolvedValue(makeSession());

    // Act
    renderAt('/onboarding');

    // Assert
    expect(await screen.findByRole('heading', { name: 'Your communities' })).toBeInTheDocument();
  });
});

describe('the sign-in loop', () => {
  it('routes a first-time user from Welcome to Complete your profile, and Sign out returns to Welcome', async () => {
    // Arrange
    fetchSession.mockRejectedValue(unauthorized());
    signInWithGoogle.mockResolvedValue(
      makeSession({ user: makeUser({ displayName: null }), needsOnboarding: true }),
    );
    logout.mockResolvedValue(undefined);
    renderAt('/');
    await welcomeHeading();

    // Act — sign in
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Complete your profile' }),
    ).toBeInTheDocument();

    // Act — sign out
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(await welcomeHeading()).toBeInTheDocument();
  });
});

describe('unknown paths', () => {
  beforeEach(() => {
    fetchSession.mockRejectedValue(unauthorized());
  });

  it('renders the not-found page', async () => {
    // Act
    renderAt('/no-such-page');

    // Assert
    expect(await screen.findByRole('heading', { name: /doesn't exist/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('has no /login route — signing in is a button on Welcome, not a screen', async () => {
    // Act
    renderAt('/login');

    // Assert
    expect(await screen.findByRole('heading', { name: /doesn't exist/ })).toBeInTheDocument();
  });
});
