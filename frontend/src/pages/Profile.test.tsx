import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingInvite, rememberPendingInvite } from '../lib/pendingInvite';
import { useAuthStore } from '../stores/auth';
import { makeSession, makeUser, networkError } from '../test/fixtures';
import { Profile } from './Profile';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../api/auth', () => ({ logout }));

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore
    .getState()
    .setSession(
      makeSession({ user: makeUser({ displayName: 'Ofri', preferredService: 'TIDAL' }) }),
    );
});

describe('Profile (minimal)', () => {
  it('shows who is signed in and their service', () => {
    // Act
    render(<Profile />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Ofri' })).toBeInTheDocument();
    expect(screen.getByText('Listens on Tidal')).toBeInTheDocument();
  });

  it('signs out, clears the session and forgets any pending invite', async () => {
    // Arrange
    logout.mockResolvedValue(undefined);
    rememberPendingInvite('/invite/abc');
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(pendingInvite()).toBeNull();
  });

  it('keeps the session when signing out fails, and the button returns', async () => {
    // Arrange
    logout.mockRejectedValue(networkError());
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
