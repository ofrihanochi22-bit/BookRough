import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { httpError, makeSession, makeUser, setDesign, setOnline } from '../test/fixtures';
import { CompleteProfile } from './CompleteProfile';

const { checkDisplayName, updateProfile } = vi.hoisted(() => ({
  checkDisplayName: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('../api/users', () => ({ checkDisplayName, updateProfile }));
vi.mock('../api/auth', () => ({ logout: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
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

afterEach(() => {
  setDesign('current');
});

const cassette = () => screen.getByTestId('community-cover');

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Display name'), 'Ofri');
  expect(await screen.findByText('✓ Available')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Tidal' }));
}

describe('Complete Your Profile under Mixtape (ui-redesign.md §5.13)', () => {
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

  it('puts the selected avatar tile on tape paper and moves it when the other is chosen', async () => {
    // Arrange
    render(<CompleteProfile />);
    const generated = screen.getByRole('radio', { name: 'Generated' }).closest('label');
    const google = screen.getByRole('radio', { name: 'Google photo' }).closest('label');
    expect(generated).toHaveClass('bg-tape');
    expect(google).toHaveClass('border-line');

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Google photo' }));

    // Assert
    expect(google).toHaveClass('bg-tape');
    expect(generated).not.toHaveClass('bg-tape');
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
