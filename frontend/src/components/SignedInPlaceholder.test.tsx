import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, makeUser } from '../test/fixtures';
import { SignedInPlaceholder } from './SignedInPlaceholder';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../api/auth', () => ({ logout }));

beforeEach(() => {
  logout.mockReset();
  useAuthStore.getState().setSession(makeSession({ user: makeUser({ displayName: 'Dana Levi' }) }));
});

describe('SignedInPlaceholder', () => {
  it("renders the title, the note, and the user's generated avatar", () => {
    // Act
    render(<SignedInPlaceholder title="Hi" note="Coming soon." />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dana Levi' })).toHaveTextContent('DL');
  });

  it('signs out: calls the API, then clears the session', async () => {
    // Arrange
    logout.mockResolvedValue(undefined);
    render(<SignedInPlaceholder title="Hi" note="." />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('shows a busy, disabled button while signing out', async () => {
    // Arrange
    logout.mockReturnValue(new Promise(() => {}));
    render(<SignedInPlaceholder title="Hi" note="." />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    const button = screen.getByRole('button', { name: 'Signing out…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps the session and re-enables the button when sign-out fails', async () => {
    // Arrange
    logout.mockRejectedValue(new Error('offline'));
    render(<SignedInPlaceholder title="Hi" note="." />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
