import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, resetAuthStore, setOnline } from '../test/fixtures';
import { GoogleSignIn, SIGN_IN_COPY } from './GoogleSignIn';

const { signInWithGoogle, toastSuccess, google } = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  toastSuccess: vi.fn(),
  google: { credential: 'cred-1' },
}));
vi.mock('../api/auth', () => ({ signInWithGoogle }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: vi.fn() } }));
// Google's button is an external boundary: one plain button whose words follow `text`.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({
    onSuccess,
    text,
  }: {
    onSuccess: (response: { credential?: string }) => void;
    text?: string;
  }) => (
    <button onClick={() => onSuccess({ credential: google.credential })}>
      {text === 'signin_with' ? 'Sign in with Google' : 'Sign up with Google'}
    </button>
  ),
}));

const session = (created: boolean) => ({ ...makeSession(), created });
const option = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
  setOnline(true);
  google.credential = 'cred-1';
});

describe('GoogleSignIn — the switch', () => {
  it('starts on Sign in by default, and the switch changes the button and the intent', async () => {
    // Arrange
    signInWithGoogle.mockResolvedValue(session(true));
    render(<GoogleSignIn />);

    // Assert
    expect(screen.getByRole('group', { name: SIGN_IN_COPY.question })).toBeInTheDocument();
    expect(option('Sign in')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();

    // Act
    await userEvent.click(option('Create account'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));

    // Assert
    expect(option('Create account')).toHaveAttribute('aria-pressed', 'true');
    expect(signInWithGoogle).toHaveBeenCalledWith('cred-1', 'signup');
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('can start on Create account (the invite preview)', () => {
    // Act
    render(<GoogleSignIn defaultIntent="signup" />);

    // Assert
    expect(option('Create account')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  });

  it('signs an existing account in with intent signin, without a toast', async () => {
    // Arrange
    signInWithGoogle.mockResolvedValue(session(false));
    render(<GoogleSignIn />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    // Assert
    expect(signInWithGoogle).toHaveBeenCalledWith('cred-1', 'signin');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('says "already have an account" when Create account found one (D3)', async () => {
    // Arrange
    signInWithGoogle.mockResolvedValue(session(false));
    render(<GoogleSignIn defaultIntent="signup" />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));

    // Assert
    expect(toastSuccess).toHaveBeenCalledWith(SIGN_IN_COPY.alreadyRegistered);
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('disables the switch offline', () => {
    // Arrange
    setOnline(false);

    // Act
    render(<GoogleSignIn />);

    // Assert
    expect(option('Sign in')).toBeDisabled();
    expect(option('Create account')).toBeDisabled();
  });
});

describe('GoogleSignIn — Sign in without an account (D2)', () => {
  async function reachNotice() {
    signInWithGoogle.mockRejectedValueOnce(httpError(404, SIGN_IN_COPY.noAccount));
    render(<GoogleSignIn />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  }

  it('shows the notice instead of the button, signed out', async () => {
    // Act
    await reachNotice();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(SIGN_IN_COPY.noAccount);
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).not.toBe('signedIn');
  });

  it('Create account resends the same credential with signup, with no second popup', async () => {
    // Arrange
    await reachNotice();
    signInWithGoogle.mockResolvedValueOnce(session(true));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // Assert
    expect(signInWithGoogle).toHaveBeenLastCalledWith('cred-1', 'signup');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('Use another Google account brings the switch back', async () => {
    // Arrange
    await reachNotice();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Use another Google account' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('an expired credential says so, and Try again switches to Create account', async () => {
    // Arrange
    await reachNotice();
    signInWithGoogle.mockRejectedValueOnce(httpError(401, 'Google sign-in failed.'));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(SIGN_IN_COPY.expired);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(option('Create account')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  });

  it('any other failure keeps the notice with an error, ready to retry', async () => {
    // Arrange
    await reachNotice();
    signInWithGoogle.mockRejectedValueOnce(httpError(503, 'Unavailable'));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_COPY.failed);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });
});
