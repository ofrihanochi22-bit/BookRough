import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore, type PublicUser } from '../stores/auth';
import { makeSession, makeUser, resetAuthStore, setDesign, setOnline } from '../test/fixtures';
import { Profile } from './Profile';

const api = vi.hoisted(() => ({
  checkDisplayName: vi.fn(),
  updateProfile: vi.fn(),
  chooseGooglePhoto: vi.fn(),
  uploadAvatar: vi.fn(),
}));
vi.mock('../api/users', () => api);
vi.mock('../api/auth', () => ({ logout: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn() } }));
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: () => <button>Continue with Google</button>,
}));

function signedInAs(overrides: Partial<PublicUser> = {}, isAdmin = false) {
  const user = makeUser({ displayName: 'Ofri', preferredService: 'TIDAL', ...overrides });
  useAuthStore.getState().setSession(makeSession({ user, isAdmin }));
  return user;
}

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

beforeEach(() => {
  vi.resetAllMocks();
  setDesign('mixtape');
  setOnline(true);
  signedInAs();
  api.checkDisplayName.mockResolvedValue({ available: true, reason: null });
});

afterEach(() => {
  cleanup();
  resetAuthStore();
  setDesign('current');
});

describe('My Profile under Mixtape (ui-redesign.md §5.11)', () => {
  it('puts the avatar, Upload a photo and the Google photo choice on a tape card', () => {
    // Act
    renderProfile();

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument();
    const card = screen.getByTestId('profile-tape');
    expect(within(card).getByTestId('cover-stripe')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Ofri' })).toBeInTheDocument();
    expect(within(card).getByText('Upload a photo')).toBeInTheDocument();
    expect(within(card).getByText('Use my Google photo')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('offers Use generated avatar on the card when a photo is in use', () => {
    // Arrange
    signedInAs({ profilePictureUrl: 'https://pic/google' });

    // Act
    renderProfile();

    // Assert
    const card = screen.getByTestId('profile-tape');
    expect(within(card).getByRole('button', { name: 'Use generated avatar' })).toBeEnabled();
    expect(card).toHaveTextContent('Your Google photo will be deleted from BookRough.');
  });

  it('puts the selected service on tape paper and moves it with the choice', async () => {
    // Arrange
    renderProfile();
    const label = (name: string) => screen.getByRole('radio', { name }).closest('label')!;
    expect(label('Tidal').className).toContain('bg-tape');

    // Act
    await userEvent.click(screen.getByRole('radio', { name: 'Deezer' }));

    // Assert
    expect(screen.getByRole('radio', { name: 'Deezer' })).toBeChecked();
    expect(label('Deezer').className).toContain('bg-tape');
    expect(label('Tidal').className).not.toContain('bg-tape');
    expect(saveButton()).toBeEnabled();
  });

  it('shows a name the server reports as taken on the kit field in danger', async () => {
    // Arrange
    api.checkDisplayName.mockResolvedValue({ available: false, reason: 'taken' });
    renderProfile();
    const field = screen.getByLabelText('Display name');

    // Act
    await userEvent.clear(field);
    await userEvent.type(field, 'Dana');

    // Assert
    expect(await screen.findByText('That display name is already taken.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.className).toContain('border-danger');
    expect(saveButton()).toBeDisabled();
  });

  it('shows the Admin area row with its chevron for admins only', () => {
    // Arrange
    signedInAs({}, true);

    // Act
    renderProfile();

    // Assert
    expect(screen.getByRole('link', { name: 'Admin area' })).toHaveAttribute('href', '/admin');
  });

  it('has no Admin area row for other users, and a Sign out pill', () => {
    // Act
    renderProfile();

    // Assert
    expect(screen.queryByRole('link', { name: 'Admin area' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('dashes Save and locks the avatar controls offline', () => {
    // Arrange
    setOnline(false);

    // Act
    renderProfile();

    // Assert
    expect(saveButton()).toBeDisabled();
    expect(saveButton().className).toContain('border-dashed');
    expect(screen.getByText('Connect to change your avatar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload a photo')).toBeDisabled();
  });
});
