import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, makeUser, setOnline } from '../test/fixtures';
import { CompleteProfile } from './CompleteProfile';

const { checkDisplayName, updateProfile } = vi.hoisted(() => ({
  checkDisplayName: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('../api/users', () => ({ checkDisplayName, updateProfile }));
vi.mock('../api/auth', () => ({ logout: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  useAuthStore.getState().setSession(
    makeSession({
      user: makeUser({
        displayName: null,
        preferredService: null,
        profilePictureUrl: 'https://pic/google',
      }),
      needsOnboarding: true,
    }),
  );
  checkDisplayName.mockResolvedValue({ available: true, reason: null });
});

const cassette = () => screen.getByTestId('community-cover');

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Display name'), 'Ofri');
  expect(await screen.findByText('✓ Available')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Tidal' }));
}

describe('Complete Your Profile (ui-redesign.md §5.13)', () => {
  it('shows the compact logo, the heading and an empty cassette', () => {
    // Act
    render(<CompleteProfile />);

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Complete your profile' })).toHaveClass(
      'font-bold',
    );
    expect(cassette()).toHaveAttribute('aria-hidden', 'true');
    expect(within(cassette()).getByText('♪')).toBeInTheDocument();
    expect(within(cassette()).getByTestId('cover-stripe')).toBeInTheDocument();
  });

  it('shows the display name on the cassette as it is typed', async () => {
    // Arrange
    render(<CompleteProfile />);

    // Act
    await userEvent.type(screen.getByLabelText('Display name'), '  Ofri  ');

    // Assert
    expect(within(cassette()).getByText('Ofri')).toBeInTheDocument();
    expect(within(cassette()).queryByText('♪')).not.toBeInTheDocument();
  });

  it('offers both avatar options as radios in one labelled group', () => {
    // Act
    render(<CompleteProfile />);

    // Assert
    const group = screen.getByRole('group', { name: 'Your avatar' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(within(group).getByRole('radio', { name: 'Generated' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Google photo' })).not.toBeChecked();
  });

  it('marks the selected avatar tile with an ink border and a check, never a light fill', () => {
    // Act
    render(<CompleteProfile />);

    // Assert
    const generated = screen.getByRole('radio', { name: 'Generated' }).closest('label');
    const google = screen.getByRole('radio', { name: 'Google photo' }).closest('label');
    expect(generated).toHaveClass('border-ink', 'font-semibold');
    expect(generated).not.toHaveClass('bg-tape');
    expect(within(generated!).getByTestId('avatar-tile-check')).toBeInTheDocument();
    expect(google).toHaveClass('border-line');
    expect(within(google!).queryByTestId('avatar-tile-check')).not.toBeInTheDocument();
  });

  it('moves the border, the check and the checked state when the other tile is chosen', async () => {
    // Arrange
    render(<CompleteProfile />);
    const generated = screen.getByRole('radio', { name: 'Generated' }).closest('label');
    const google = screen.getByRole('radio', { name: 'Google photo' }).closest('label');

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Google photo' }));

    // Assert
    expect(screen.getByRole('radio', { name: 'Google photo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Generated' })).not.toBeChecked();
    expect(google).toHaveClass('border-ink');
    expect(within(google!).getByTestId('avatar-tile-check')).toBeInTheDocument();
    expect(generated).toHaveClass('border-line');
    expect(within(generated!).queryByTestId('avatar-tile-check')).not.toBeInTheDocument();
  });

  it('chooses an avatar tile from the keyboard', async () => {
    // Arrange
    render(<CompleteProfile />);
    screen.getByRole('radio', { name: 'Generated' }).focus();

    // Act
    await userEvent.keyboard('{ArrowRight}');

    // Assert
    expect(screen.getByRole('radio', { name: 'Google photo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Google photo' })).toHaveFocus();
  });

  it('saves the chosen values from Continue', async () => {
    // Arrange
    updateProfile.mockResolvedValue(makeSession());
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Assert
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Ofri',
      preferredService: 'TIDAL',
      useGooglePicture: false,
    });
  });

  it('shows the offline alert and keeps Continue disabled while offline', () => {
    // Arrange
    setOnline(false);

    // Act
    render(<CompleteProfile />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline");
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('shows a save failure as a form alert', async () => {
    // Arrange
    updateProfile.mockRejectedValue(httpError(500, 'Something broke.'));
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Something broke.');
  });
});
