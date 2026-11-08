import { describe, expect, it } from 'vitest';

import { AvatarImageError, isUploadedAvatar, MAX_PICKED_BYTES, prepareAvatar } from './avatarImage';

/**
 * The browser half of an upload — docs/features/avatar-upload.md §5.1. jsdom has
 * no canvas or image decoder, so the drawing itself is proven live in Chrome and
 * by the server's own re-encode; these tests cover the decisions around it.
 */
describe('isUploadedAvatar', () => {
  it('recognises only the server upload URL, not a Google photo or nothing', () => {
    // Act & Assert
    expect(isUploadedAvatar('/api/users/0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40/avatar?v=12')).toBe(
      true,
    );
    expect(isUploadedAvatar('https://lh3.googleusercontent.com/a/x')).toBe(false);
    expect(isUploadedAvatar('/api/users/not-an-id/avatar?v=1')).toBe(false);
    expect(isUploadedAvatar(null)).toBe(false);
  });
});

describe('prepareAvatar', () => {
  it('refuses a file over 10 MB before reading it', async () => {
    // Arrange
    const huge = new File([new Uint8Array(MAX_PICKED_BYTES + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });

    // Act
    const error = await prepareAvatar(huge).catch((caught: unknown) => caught);

    // Assert
    expect(error).toBeInstanceOf(AvatarImageError);
    expect(error).toMatchObject({ message: 'That image is too large.' });
  });

  it('says the file is not supported when the browser cannot decode it', async () => {
    // Arrange: jsdom cannot decode images, exactly like a corrupt file in a browser.
    const file = new File(['not an image'], 'x.png', { type: 'image/png' });

    // Act
    const error = await prepareAvatar(file).catch((caught: unknown) => caught);

    // Assert
    expect(error).toBeInstanceOf(AvatarImageError);
    expect(error).toMatchObject({
      message: "That file isn't a supported image. Use a JPEG, PNG or WebP.",
    });
  });
});
