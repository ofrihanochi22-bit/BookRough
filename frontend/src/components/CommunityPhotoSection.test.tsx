import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AvatarImage from '../lib/avatarImage';
import { httpError, makeCommunity } from '../test/fixtures';
import { CommunityPhotoSection, COMMUNITY_PHOTO_COPY } from './CommunityPhotoSection';

/** Community Settings' Photo section — docs/features/community-photo.md §5.2, §7. */
const api = vi.hoisted(() => ({
  uploadCommunityPhoto: vi.fn(),
  removeCommunityPhoto: vi.fn(),
  prepareAvatar: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('../api/communities', () => ({
  uploadCommunityPhoto: api.uploadCommunityPhoto,
  removeCommunityPhoto: api.removeCommunityPhoto,
}));
vi.mock('../lib/avatarImage', async (importOriginal) => ({
  ...(await importOriginal<typeof AvatarImage>()),
  prepareAvatar: api.prepareAvatar,
}));
vi.mock('react-hot-toast', () => ({ default: { success: api.toastSuccess } }));

const PHOTO = '/api/communities/0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40/photo?v=1';
const file = () => new File(['x'], 'me.png', { type: 'image/png' });
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

function renderSection(photoUrl: string | null = null, disabled = false) {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(
    <CommunityPhotoSection
      community={makeCommunity({ photoUrl })}
      disabled={disabled}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CommunityPhotoSection — upload', () => {
  it('shows "Uploading…", then toasts and reloads the screen', async () => {
    // Arrange
    const prepared = new Blob(['w'], { type: 'image/webp' });
    let finish: (value: unknown) => void = () => {};
    api.prepareAvatar.mockResolvedValue(prepared);
    api.uploadCommunityPhoto.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onChanged = renderSection();

    // Act
    await userEvent.upload(picker(), file());

    // Assert
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    finish(makeCommunity({ photoUrl: PHOTO }));
    await waitFor(() => expect(api.toastSuccess).toHaveBeenCalledWith('Photo updated'));
    expect(api.uploadCommunityPhoto).toHaveBeenCalledWith(makeCommunity().id, prepared);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('shows the server 422 inline', async () => {
    // Arrange
    api.prepareAvatar.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
    api.uploadCommunityPhoto.mockRejectedValue(
      httpError(422, "That file isn't a supported image. Use a JPEG, PNG or WebP."),
    );
    renderSection();

    // Act
    await userEvent.upload(picker(), file());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't a supported image");
  });

  it('refuses a file over 10 MB before uploading', async () => {
    // Arrange: the real browser step runs, and refuses on size alone.
    const actual = await vi.importActual<typeof AvatarImage>('../lib/avatarImage');
    api.prepareAvatar.mockImplementation(actual.prepareAvatar);
    renderSection();
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });

    // Act
    await userEvent.upload(picker(), huge);

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('That image is too large.');
    expect(api.uploadCommunityPhoto).not.toHaveBeenCalled();
  });

  it('says Replace photo when there is one', () => {
    // Act
    renderSection(PHOTO);

    // Assert
    expect(screen.getByText('Replace photo')).toBeInTheDocument();
  });

  it('disables everything offline', () => {
    // Act
    renderSection(PHOTO, true);

    // Assert
    expect(picker()).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove photo/ })).toBeDisabled();
  });
});

describe('CommunityPhotoSection — remove', () => {
  it('offers no Remove without a photo', () => {
    // Act
    renderSection(null);

    // Assert
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('confirms, removes, toasts and reloads', async () => {
    // Arrange
    api.removeCommunityPhoto.mockResolvedValue(makeCommunity());
    const onChanged = renderSection(PHOTO);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: COMMUNITY_PHOTO_COPY.removeTitle });
    expect(within(sheet).getByText(COMMUNITY_PHOTO_COPY.removeBody)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    await waitFor(() => expect(api.toastSuccess).toHaveBeenCalledWith('Photo removed'));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the sheet open with the error when removing fails', async () => {
    // Arrange
    api.removeCommunityPhoto.mockRejectedValue(httpError(403, 'Only admins can change the photo.'));
    renderSection(PHOTO);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    const sheet = screen.getByRole('dialog', { name: COMMUNITY_PHOTO_COPY.removeTitle });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove photo' }));

    // Assert
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Only admins can change the photo.',
    );
  });
});
