import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AvatarImage from '../lib/avatarImage';
import { httpError, makeCommunity, setOnline } from '../test/fixtures';
import { CreateCommunity, PHOTO_NOT_UPLOADED } from './CreateCommunity';

/** The optional photo on Create Community — docs/features/community-photo.md §5.3, §7. */
const api = vi.hoisted(() => ({
  createCommunity: vi.fn(),
  uploadCommunityPhoto: vi.fn(),
  prepareAvatar: vi.fn(),
  listFriends: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/communities', () => ({
  createCommunity: api.createCommunity,
  uploadCommunityPhoto: api.uploadCommunityPhoto,
}));
vi.mock('../lib/avatarImage', async (importOriginal) => ({
  ...(await importOriginal<typeof AvatarImage>()),
  prepareAvatar: api.prepareAvatar,
}));
vi.mock('../api/friends', () => ({ listFriends: api.listFriends }));
vi.mock('../api/invitations', () => ({ inviteFriends: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: api.toastError } }));

const CREATED = makeCommunity({ id: '7a1c2e3d-4b5f-4a6e-9c8d-0e1f2a3b4c5d' });
const PREPARED = new Blob(['w'], { type: 'image/webp' });
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const file = () => new File(['x'], 'cover.png', { type: 'image/png' });

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/communities/new']}>
      <Routes>
        <Route path="/communities/new" element={<CreateCommunity />} />
        <Route path="/communities/:id" element={<p>Community page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function nameAndCreate() {
  await userEvent.type(screen.getByLabelText('Name'), 'Friday Jazz');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  setOnline(true);
  api.listFriends.mockResolvedValue([]);
  api.createCommunity.mockResolvedValue(CREATED);
  api.prepareAvatar.mockResolvedValue(PREPARED);
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CreateCommunity — photo', () => {
  it('previews a chosen photo in the cover, and Remove clears it', async () => {
    // Arrange
    renderForm();

    // Act
    await userEvent.upload(picker(), file());

    // Assert
    expect(await screen.findByTestId('cover-photo')).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByText('Change photo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByTestId('cover-photo')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('creates the community, then uploads the photo to it', async () => {
    // Arrange
    api.uploadCommunityPhoto.mockResolvedValue(CREATED);
    renderForm();
    await userEvent.upload(picker(), file());
    await screen.findByTestId('cover-photo');

    // Act
    await nameAndCreate();

    // Assert
    expect(await screen.findByText('Community page')).toBeInTheDocument();
    expect(api.uploadCommunityPhoto).toHaveBeenCalledWith(CREATED.id, PREPARED);
    expect(api.toastError).not.toHaveBeenCalled();
  });

  it('still lands on the new community when the photo upload fails', async () => {
    // Arrange
    api.uploadCommunityPhoto.mockRejectedValue(httpError(429, 'Too many requests.'));
    renderForm();
    await userEvent.upload(picker(), file());
    await screen.findByTestId('cover-photo');

    // Act
    await nameAndCreate();

    // Assert
    expect(await screen.findByText('Community page')).toBeInTheDocument();
    expect(api.toastError).toHaveBeenCalledWith(PHOTO_NOT_UPLOADED);
  });

  it('sends one request without a photo', async () => {
    // Arrange
    renderForm();

    // Act
    await nameAndCreate();

    // Assert
    await waitFor(() => expect(api.createCommunity).toHaveBeenCalledOnce());
    expect(api.uploadCommunityPhoto).not.toHaveBeenCalled();
  });

  it('shows a refused file inline and keeps Create available', async () => {
    // Arrange
    const actual = await vi.importActual<typeof AvatarImage>('../lib/avatarImage');
    api.prepareAvatar.mockImplementation(actual.prepareAvatar);
    renderForm();
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });

    // Act
    await userEvent.upload(picker(), huge);
    await userEvent.type(screen.getByLabelText('Name'), 'Friday Jazz');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('That image is too large.');
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
});
