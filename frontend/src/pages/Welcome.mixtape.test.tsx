import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SIGN_IN_COPY } from '../components/GoogleSignIn';
import { useSettingsStore } from '../stores/settings';
import { httpError, resetAuthStore, setOnline } from '../test/fixtures';
import { emulateDevice, resetDevice, USER_AGENTS } from '../test/userAgents';
import { Welcome } from './Welcome';

const { signInWithGoogle } = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
vi.mock('../api/auth', () => ({ signInWithGoogle }));
// Google's button is an external boundary: one plain button named after its `text`.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({
    onSuccess,
    text,
  }: {
    onSuccess: (response: { credential?: string }) => void;
    text?: string;
  }) => (
    <button onClick={() => onSuccess({ credential: 'google-id-token' })}>
      {text === 'signup_with' ? 'Sign up with Google' : 'Sign in with Google'}
    </button>
  ),
}));

beforeEach(() => {
  vi.resetAllMocks();
  resetAuthStore();
  setOnline(true);
});

afterEach(() => {
  resetDevice();
  window.localStorage.clear();
});

describe('Welcome (ui-redesign.md §5.12)', () => {
  it('shows the hero logo as the h1, the admin tagline and the privacy line, with no demo line', () => {
    // Arrange
    useSettingsStore.setState({ welcomeTagline: 'Songs between friends.' });

    // Act
    render(<Welcome />);

    // Assert
    expect(screen.getByRole('heading', { level: 1, name: 'BookRough' })).toBeInTheDocument();
    expect(screen.getByText('Songs between friends.')).toHaveClass('font-display');
    expect(screen.getByText('No passwords. We never store your email.')).toBeInTheDocument();
    expect(screen.queryByText('Spotify link')).not.toBeInTheDocument();
    expect(screen.queryByText('Apple Music')).not.toBeInTheDocument();
  });

  it('offers Sign in / Create account as a pill track, the selected side on tape paper', async () => {
    // Arrange
    render(<Welcome />);
    const group = screen.getByRole('group', { name: SIGN_IN_COPY.question });
    const signIn = screen.getByRole('button', { name: 'Sign in' });
    const create = screen.getByRole('button', { name: 'Create account' });
    expect(group).toContainElement(signIn);
    expect(signIn).toHaveAttribute('aria-pressed', 'true');
    expect(signIn).toHaveClass('bg-tape');

    // Act
    await userEvent.click(create);

    // Assert
    expect(create).toHaveAttribute('aria-pressed', 'true');
    expect(create).toHaveClass('bg-tape');
    expect(signIn).not.toHaveClass('bg-tape');
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();
  });

  it('shows the install hint on an iPhone as a tape-paper note', () => {
    // Arrange
    emulateDevice(USER_AGENTS.iphoneSafari, { maxTouchPoints: 5 });

    // Act
    render(<Welcome />);

    // Assert
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Add to Home Screen');
    expect(note).toHaveClass('bg-tape');
    expect(note).not.toHaveClass('bg-accent-soft');
  });

  it('disables both sides of the track while offline', () => {
    // Arrange
    setOnline(false);

    // Act
    render(<Welcome />);

    // Assert
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('keeps the "no account" offer after a Sign in answered 404', async () => {
    // Arrange
    signInWithGoogle.mockRejectedValue(httpError(404, 'No account'));
    render(<Welcome />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    // Assert
    expect(await screen.findByText(SIGN_IN_COPY.noAccount)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use another Google account' })).toBeInTheDocument();
  });
});
