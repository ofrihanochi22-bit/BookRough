import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DISPLAY_NAME_MESSAGES } from '../lib/displayName';
import { pendingInvite, rememberPendingInvite } from '../lib/pendingInvite';
import { useAuthStore, type PublicUser } from '../stores/auth';
import { httpError, makeSession, makeUser, networkError, setOnline } from '../test/fixtures';
import { Profile } from './Profile';

const api = vi.hoisted(() => ({
  checkDisplayName: vi.fn(),
  updateProfile: vi.fn(),
  chooseGooglePhoto: vi.fn(),
  logout: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../api/users', () => ({
  checkDisplayName: api.checkDisplayName,
  updateProfile: api.updateProfile,
  chooseGooglePhoto: api.chooseGooglePhoto,
}));
vi.mock('../api/auth', () => ({ logout: api.logout }));
vi.mock('react-hot-toast', () => ({ default: { success: api.toastSuccess } }));
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (r: { credential: string }) => void;
    onError: () => void;
  }) => (
    <>
      <button onClick={() => onSuccess({ credential: 'id-token' })}>Continue with Google</button>
      <button onClick={onError}>Close Google popup</button>
    </>
  ),
}));

const PHOTO = 'https://pic/google';

function signedInAs(overrides: Partial<PublicUser> = {}) {
  const user = makeUser({ displayName: 'Ofri', preferredService: 'TIDAL', ...overrides });
  useAuthStore.getState().setSession(makeSession({ user }));
  return user;
}

/** What the server answers with after a save: the same session, changed. */
function sessionWith(overrides: Partial<PublicUser>) {
  return makeSession({ user: { ...useAuthStore.getState().user!, ...overrides } });
}

const nameInput = () => screen.getByLabelText('Display name');
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });
const photo = () => document.querySelector('img');

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  signedInAs();
  api.checkDisplayName.mockResolvedValue({ available: true, reason: null });
});

describe('Profile — render', () => {
  it('shows the current name, service and avatar, with Save disabled until something changes', () => {
    // Act
    render(<Profile />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Ofri');
    expect(screen.getByText('Any language. 2–20 characters.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tidal' })).toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(api.checkDisplayName).not.toHaveBeenCalled();
  });
});

describe('Profile — saving', () => {
  it('checks a new name, sends only the name, toasts and updates the store', async () => {
    // Arrange
    api.updateProfile.mockResolvedValue(sessionWith({ displayName: 'Ofri H' }));
    render(<Profile />);

    // Act
    await userEvent.clear(nameInput());
    await userEvent.type(nameInput(), 'Ofri H');
    expect(await screen.findByText('✓ Available')).toBeInTheDocument();
    await userEvent.click(saveButton());

    // Assert
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'Ofri H' });
    expect(api.toastSuccess).toHaveBeenCalledWith('Profile updated');
    expect(useAuthStore.getState().user?.displayName).toBe('Ofri H');
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(nameInput()).toHaveValue('Ofri H');
  });

  it('sends only the service when only the service changed', async () => {
    // Arrange
    api.updateProfile.mockResolvedValue(sessionWith({ preferredService: 'DEEZER' }));
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Deezer' }));
    await userEvent.click(saveButton());

    // Assert
    expect(api.updateProfile).toHaveBeenCalledWith({ preferredService: 'DEEZER' });
    expect(useAuthStore.getState().user?.preferredService).toBe('DEEZER');
    expect(api.checkDisplayName).not.toHaveBeenCalled();
  });

  it('keeps Save disabled for a name the live check reports taken', async () => {
    // Arrange
    api.checkDisplayName.mockResolvedValue({ available: false, reason: 'taken' });
    render(<Profile />);

    // Act
    await userEvent.clear(nameInput());
    await userEvent.type(nameInput(), 'Dana');

    // Assert
    expect(await screen.findByText(DISPLAY_NAME_MESSAGES.taken)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('shows a 409 on the name line and keeps the typed values', async () => {
    // Arrange
    api.updateProfile.mockRejectedValue(httpError(409, DISPLAY_NAME_MESSAGES.taken));
    render(<Profile />);
    await userEvent.clear(nameInput());
    await userEvent.type(nameInput(), 'Dana');
    await screen.findByText('✓ Available');
    await userEvent.click(screen.getByRole('radio', { name: 'Deezer' }));

    // Act
    await userEvent.click(saveButton());

    // Assert
    expect(await screen.findByText(DISPLAY_NAME_MESSAGES.taken)).toHaveAttribute(
      'id',
      'display-name-status',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(nameInput()).toHaveValue('Dana');
    expect(screen.getByRole('radio', { name: 'Deezer' })).toBeChecked();
    expect(useAuthStore.getState().user?.displayName).toBe('Ofri');
    expect(api.toastSuccess).not.toHaveBeenCalled();
  });

  it('shows any other failure inline above Save, and Save comes back', async () => {
    // Arrange
    api.updateProfile.mockRejectedValue(networkError());
    render(<Profile />);
    await userEvent.click(screen.getByRole('radio', { name: 'Deezer' }));

    // Act
    await userEvent.click(saveButton());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    expect(saveButton()).toBeEnabled();
  });
});

describe('Profile — avatar', () => {
  it('switches from the Google photo to the generated avatar', async () => {
    // Arrange
    signedInAs({ profilePictureUrl: PHOTO });
    api.updateProfile.mockResolvedValue(sessionWith({ profilePictureUrl: null }));
    render(<Profile />);
    expect(photo()).toHaveAttribute('src', PHOTO);
    expect(
      screen.getByText('Your Google photo will be deleted from BookRough.'),
    ).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Use generated avatar' }));

    // Assert
    expect(api.updateProfile).toHaveBeenCalledWith({ useGooglePicture: false });
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(photo()).toBeNull();
  });

  it('shows an inline error when switching to the generated avatar fails', async () => {
    // Arrange
    signedInAs({ profilePictureUrl: PHOTO });
    api.updateProfile.mockRejectedValue(httpError(500, 'Something went wrong.'));
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Use generated avatar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(photo()).toHaveAttribute('src', PHOTO);
  });

  it('re-chooses the Google photo with a fresh credential', async () => {
    // Arrange
    api.chooseGooglePhoto.mockResolvedValue(sessionWith({ profilePictureUrl: PHOTO }));
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(api.chooseGooglePhoto).toHaveBeenCalledWith('id-token');
    expect(await screen.findByRole('button', { name: 'Use generated avatar' })).toBeInTheDocument();
    expect(photo()).toHaveAttribute('src', PHOTO);
  });

  it.each([
    [
      'a different Google account',
      httpError(403, "That's a different Google account. Use the account you signed up with."),
    ],
    ['an account with no photo', httpError(422, 'Your Google account has no photo.')],
  ])('shows the server message for %s and keeps the avatar', async (_label, error) => {
    // Arrange
    api.chooseGooglePhoto.mockRejectedValue(error);
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      (error.response?.data as { message: string }).message,
    );
    expect(photo()).toBeNull();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('shows the popup message when the Google popup fails', async () => {
    // Arrange
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Close Google popup' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Google sign-in didn't complete. Please try again.",
    );
    expect(api.chooseGooglePhoto).not.toHaveBeenCalled();
  });
});

describe('Profile — offline', () => {
  it('shows the banner and disables Save and the avatar actions, but not Sign out', async () => {
    // Arrange
    setOnline(false);
    signedInAs({ profilePictureUrl: PHOTO });
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Deezer' }));

    // Assert
    expect(screen.getByText("You're offline. Connect to change your profile.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use generated avatar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('replaces the Google button with a hint while offline', () => {
    // Arrange
    setOnline(false);

    // Act
    render(<Profile />);

    // Assert
    expect(screen.getByText('Connect to change your avatar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });
});

describe('Profile — sign out', () => {
  it('signs out, clears the session and forgets any pending invite', async () => {
    // Arrange
    api.logout.mockResolvedValue(undefined);
    rememberPendingInvite('/invite/abc');
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(pendingInvite()).toBeNull();
  });

  it('keeps the session when signing out fails, and the button returns', async () => {
    // Arrange
    api.logout.mockRejectedValue(networkError());
    render(<Profile />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Assert
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
