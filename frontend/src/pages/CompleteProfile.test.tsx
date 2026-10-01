import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { makeSession, makeUser } from '../test/fixtures';
import { CompleteProfile } from './CompleteProfile';

const { checkDisplayName, updateProfile, logout } = vi.hoisted(() => ({
  checkDisplayName: vi.fn(),
  updateProfile: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../api/users', () => ({ checkDisplayName, updateProfile }));
vi.mock('../api/auth', () => ({ logout }));

function httpError(status: number, message: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: { status: 'error', code: status, message },
  });
}

function startOnboarding(pictureUrl: string | null = 'https://pic/google') {
  useAuthStore.getState().setSession(
    makeSession({
      user: makeUser({ displayName: null, preferredService: null, profilePictureUrl: pictureUrl }),
      needsOnboarding: true,
    }),
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

const nameInput = () => screen.getByLabelText('Display name');
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

async function fillValidForm(name = 'Ofri') {
  await userEvent.type(nameInput(), name);
  expect(await screen.findByText('✓ Available')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Apple Music' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  startOnboarding();
  checkDisplayName.mockResolvedValue({ available: true, reason: null });
});

describe('CompleteProfile — initial render', () => {
  it('shows the generated avatar selected, the Google option, five unselected services, and a disabled Continue', () => {
    // Act
    render(<CompleteProfile />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Complete your profile' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Generated' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Google photo' })).not.toBeChecked();
    expect(
      screen.getByText('Your Google photo is only kept if you choose it.'),
    ).toBeInTheDocument();
    for (const service of ['Spotify', 'Apple Music', 'YouTube', 'Tidal', 'Deezer']) {
      expect(screen.getByRole('radio', { name: service })).not.toBeChecked();
    }
    expect(continueButton()).toBeDisabled();
  });

  it('hides the Google option when there is no Google photo', () => {
    // Arrange
    startOnboarding(null);

    // Act
    render(<CompleteProfile />);

    // Assert
    expect(screen.queryByRole('radio', { name: 'Google photo' })).not.toBeInTheDocument();
  });
});

describe('CompleteProfile — name feedback', () => {
  it('checks a valid name with the server, then enables Continue once a service is chosen', async () => {
    // Arrange
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'Ofri');

    // Assert
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(await screen.findByText('✓ Available')).toBeInTheDocument();
    expect(checkDisplayName).toHaveBeenLastCalledWith('Ofri', expect.any(AbortSignal));
    expect(continueButton()).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Spotify' }));
    expect(continueButton()).toBeEnabled();
  });

  it('shows a local rule error without asking the server', async () => {
    // Arrange
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'a<b');

    // Assert
    expect(screen.getByText("That character isn't allowed.")).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(checkDisplayName).not.toHaveBeenCalled();
  });

  it.each([
    ['taken', 'That display name is already taken.'],
    ['reserved', 'That name is reserved.'],
  ] as const)('shows the %s message and keeps Continue disabled', async (reason, message) => {
    // Arrange
    checkDisplayName.mockResolvedValue({ available: false, reason });
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'Ofri');
    await userEvent.click(screen.getByRole('radio', { name: 'Spotify' }));

    // Assert
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it('still allows Continue when the check itself fails', async () => {
    // Arrange
    checkDisplayName.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'Ofri');
    await userEvent.click(screen.getByRole('radio', { name: 'Spotify' }));

    // Assert
    expect(await screen.findByText(/Couldn't check right now/)).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  it('counts visible characters', async () => {
    // Arrange
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'DJ 🎧');

    // Assert
    expect(screen.getByText('4/20')).toBeInTheDocument();
  });
});

describe('CompleteProfile — saving', () => {
  it('sends name, service and the generated-avatar choice, then stores the session', async () => {
    // Arrange
    const session = makeSession();
    updateProfile.mockResolvedValue(session);
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(continueButton());

    // Assert
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Ofri',
      preferredService: 'APPLE_MUSIC',
      useGooglePicture: false,
    });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', needsOnboarding: false });
  });

  it('sends useGooglePicture: true when the Google photo is chosen', async () => {
    // Arrange
    updateProfile.mockResolvedValue(makeSession());
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Google photo' }));
    await userEvent.click(continueButton());

    // Assert
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ useGooglePicture: true }));
  });

  it('shows "Saving…" and blocks a second submit while saving', async () => {
    // Arrange
    updateProfile.mockReturnValue(new Promise(() => {}));
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(continueButton());

    // Assert
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('on a 409 race, marks the name as taken and keeps the form', async () => {
    // Arrange
    updateProfile.mockRejectedValue(httpError(409, 'That display name is already taken.'));
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(continueButton());

    // Assert
    expect(await screen.findByText('That display name is already taken.')).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Ofri');
    expect(screen.getByRole('radio', { name: 'Apple Music' })).toBeChecked();
    expect(continueButton()).toBeDisabled();
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
  });

  it('shows a non-name error at form level', async () => {
    // Arrange
    updateProfile.mockRejectedValue(httpError(422, 'There is no Google photo to use.'));
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(continueButton());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no Google photo to use.');
    expect(screen.getByText('✓ Available')).toBeInTheDocument();
  });

  it('shows the unreachable message when the save never reaches the server', async () => {
    // Arrange
    updateProfile.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    render(<CompleteProfile />);
    await fillValidForm();

    // Act
    await userEvent.click(continueButton());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.");
    expect(continueButton()).toBeEnabled();
  });
});

describe('CompleteProfile — offline and sign out', () => {
  it('shows the offline banner and disables Continue', async () => {
    // Arrange
    setOnline(false);
    render(<CompleteProfile />);

    // Act
    await userEvent.type(nameInput(), 'Ofri');
    await userEvent.click(screen.getByRole('radio', { name: 'Spotify' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You're offline. Connect to finish your profile.",
    );
    await waitFor(() => expect(checkDisplayName).toHaveBeenCalled());
    expect(continueButton()).toBeDisabled();
  });

  it('signs out from the onboarding screen', async () => {
    // Arrange
    logout.mockResolvedValue(undefined);
    render(<CompleteProfile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
