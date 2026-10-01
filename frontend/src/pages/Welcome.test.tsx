import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore } from '../test/fixtures';
import { Welcome } from './Welcome';

const { google, signInWithGoogle } = vi.hoisted(() => ({
  google: {
    credential: 'google-id-token' as string | undefined,
    onScriptLoadError: undefined as (() => void) | undefined,
    theme: undefined as string | undefined,
  },
  signInWithGoogle: vi.fn(),
}));

// Google's button is an external boundary: replaced by two plain buttons that
// drive the success and failure callbacks.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({
    children,
    onScriptLoadError,
  }: {
    children: React.ReactNode;
    onScriptLoadError?: () => void;
  }) => {
    google.onScriptLoadError = onScriptLoadError;
    return children;
  },
  GoogleLogin: ({
    onSuccess,
    onError,
    theme,
  }: {
    onSuccess: (response: { credential?: string }) => void;
    onError: () => void;
    theme?: string;
  }) => {
    google.theme = theme;
    return (
      <>
        <button onClick={() => onSuccess({ credential: google.credential })}>
          Continue with Google
        </button>
        <button onClick={() => onError()}>Simulate Google failure</button>
      </>
    );
  },
}));

vi.mock('../api/auth', () => ({ signInWithGoogle }));

function httpError(status: number, message?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: message ? { status: 'error', code: status, message } : undefined,
  });
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  resetAuthStore();
  signInWithGoogle.mockReset();
  google.credential = 'google-id-token';
  google.onScriptLoadError = undefined;
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Welcome', () => {
  it('renders the wordmark, the value line, the Google button and the privacy line', () => {
    // Act
    render(<Welcome />);

    // Assert
    expect(screen.getByRole('heading', { name: 'BookRough' })).toBeInTheDocument();
    expect(
      screen.getByText('Share music with friends, on whatever app they use.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('No passwords. We never store your email.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows "Signing you in…" and hides the button while the API call is pending', async () => {
    // Arrange
    signInWithGoogle.mockReturnValue(new Promise(() => {}));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByText('Signing you in…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('stores the session after a successful sign-in', async () => {
    // Arrange
    const session = makeSession({ needsOnboarding: true });
    signInWithGoogle.mockResolvedValue(session);
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(signInWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', needsOnboarding: true });
  });

  it('shows the Google error when the popup fails', async () => {
    // Arrange
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Simulate Google failure' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Google sign-in didn't complete. Please try again.",
    );
  });

  it('shows the Google error when Google returns no credential', async () => {
    // Arrange
    google.credential = undefined;
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("Google sign-in didn't complete.");
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it("shows the server's message inline when the API rejects the token, and the button returns", async () => {
    // Arrange
    signInWithGoogle.mockRejectedValue(httpError(401, 'Google sign-in failed. Please try again.'));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in failed. Please try again.');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).not.toBe('signedIn');
  });

  it('falls back to a generic message when the error body has none', async () => {
    // Arrange
    signInWithGoogle.mockRejectedValue(httpError(500));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.');
  });

  it('shows the unreachable message when the API cannot be reached', async () => {
    // Arrange
    signInWithGoogle.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server.");
  });

  it('shows a generic message for an unexpected error', async () => {
    // Arrange
    signInWithGoogle.mockRejectedValue(new Error('boom'));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.');
  });

  it('explains a blocked Google script and hides the button', () => {
    // Arrange
    render(<Welcome />);

    // Act
    act(() => google.onScriptLoadError?.());

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load Google sign-in.");
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('shows the offline message instead of the button, and recovers when back online', () => {
    // Arrange
    setOnline(false);
    render(<Welcome />);
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. Connect to sign in.");
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();

    // Act
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it("uses Google's dark button when the device prefers dark mode", () => {
    // Arrange
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );

    // Act
    render(<Welcome />);

    // Assert
    expect(google.theme).toBe('filled_black');
  });

  it("uses Google's outline button in light mode", () => {
    // Arrange
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );

    // Act
    render(<Welcome />);

    // Assert
    expect(google.theme).toBe('outline');
  });
});
