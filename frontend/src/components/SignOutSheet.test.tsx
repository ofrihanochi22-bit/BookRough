import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingInvite, rememberPendingInvite } from '../lib/pendingInvite';
import { useAuthStore } from '../stores/auth';
import { makeSession, makeUser, networkError, setOnline } from '../test/fixtures';
import { SignOutButton, SignOutSheet } from './SignOutSheet';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../api/auth', () => ({ logout }));

const dialog = () => screen.getByRole('dialog');
const confirmButton = () => within(dialog()).getByRole('button', { name: /Sign(ing)? out/ });

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(makeSession({ user: makeUser() }));
});

describe('SignOutSheet', () => {
  it('renders the question, the explanation and both buttons', () => {
    // Arrange / Act
    render(<SignOutSheet onClose={() => {}} />);

    // Assert
    expect(within(dialog()).getByText('Sign out?')).toBeInTheDocument();
    expect(
      within(dialog()).getByText("You'll need to continue with Google to sign back in."),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
  });

  it('closes on Cancel without signing out', async () => {
    // Arrange
    const onClose = vi.fn();
    render(<SignOutSheet onClose={onClose} />);

    // Act
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('signs out, clears the session and forgets any pending invite', async () => {
    // Arrange
    logout.mockResolvedValue(undefined);
    rememberPendingInvite('/invite/abc');
    render(<SignOutSheet onClose={() => {}} />);

    // Act
    await userEvent.click(confirmButton());

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(pendingInvite()).toBeNull();
  });

  it('cannot be cancelled or dismissed while signing out', async () => {
    // Arrange — a request that never settles.
    logout.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<SignOutSheet onClose={onClose} />);

    // Act
    await userEvent.click(confirmButton());
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(confirmButton()).toHaveTextContent('Signing out…');
    expect(confirmButton()).toBeDisabled();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the session and stays open when signing out fails', async () => {
    // Arrange
    logout.mockRejectedValue(networkError());
    render(<SignOutSheet onClose={() => {}} />);

    // Act
    await userEvent.click(confirmButton());

    // Assert
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(confirmButton()).toHaveTextContent('Sign out');
    expect(confirmButton()).toBeEnabled();
  });

  it('disables Sign out offline with a note, and re-enables it back online', () => {
    // Arrange
    setOnline(false);

    // Act
    render(<SignOutSheet onClose={() => {}} />);

    // Assert
    expect(confirmButton()).toBeDisabled();
    expect(within(dialog()).getByRole('note')).toHaveTextContent(
      "You're offline. Connect to sign out.",
    );

    // Act — the connection returns.
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    // Assert
    expect(confirmButton()).toBeEnabled();
    expect(within(dialog()).queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('SignOutButton', () => {
  it('opens the sheet instead of signing out, and Cancel closes it', async () => {
    // Arrange
    render(<SignOutButton />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(dialog()).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    // Act
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
