import type { User } from '@prisma/client';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  adminRemovePhoto,
  AVATAR_MESSAGES,
  findAvatar,
  processAvatar,
  removeOwnAvatar,
  uploadAvatar,
} from './avatar.service.js';

/**
 * Unit tests — docs/features/avatar-upload.md §7. `sharp` is real: every input
 * image is generated here, never read from a file. Prisma is mocked; the routes
 * run against Postgres in routes/avatar.integration.test.ts.
 */

const { avatarDb, userDb, info } = vi.hoisted(() => ({
  avatarDb: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  userDb: { update: vi.fn(), findUnique: vi.fn() },
  info: vi.fn(),
}));

vi.mock('../db/prisma.js', () => {
  const client = { userAvatar: avatarDb, user: userDb };
  return {
    prisma: { ...client, $transaction: (run: (tx: typeof client) => unknown) => run(client) },
  };
});
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const USER_ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
const ME = {
  id: USER_ID,
  displayName: 'Ofri',
  preferredService: 'SPOTIFY',
  profilePictureUrl: null,
  useGooglePicture: false,
} as User;
const UPLOADED_URL = `/api/users/${USER_ID}/avatar?v=1700000000000`;

function image(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#2a6' } });
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('processAvatar', () => {
  it.each([
    ['JPEG', () => image(1200, 800).jpeg().toBuffer()],
    ['PNG', () => image(800, 1200).png().toBuffer()],
    ['WebP', () => image(600, 600).webp().toBuffer()],
  ])('turns a %s into a 256×256 WebP of at most 100 KB', async (_name, make) => {
    // Arrange
    const input = await make();

    // Act
    const output = await processAvatar(input);

    // Assert
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(output.length).toBeLessThanOrEqual(100 * 1024);
  });

  it('strips EXIF (location included) from the stored image', async () => {
    // Arrange
    const input = await image(400, 400)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: 'gps-test' } } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    // Act
    const output = await processAvatar(input);

    // Assert
    const meta = await sharp(output).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('applies the EXIF orientation before cropping', async () => {
    // Arrange: a 400×200 image tagged "rotate 90°" is portrait once applied.
    const input = await image(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    // Act
    const output = await processAvatar(input);

    // Assert — still square; the rotation was applied, not left as a tag.
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ width: 256, height: 256 });
    expect(meta.orientation).toBeUndefined();
  });

  it('refuses a file whose first bytes are not an image, whatever its name', async () => {
    // Act & Assert
    await expectAppError(
      processAvatar(Buffer.from('<html><script>alert(1)</script></html>')),
      422,
      AVATAR_MESSAGES.unsupported,
    );
  });

  it('refuses a truncated image', async () => {
    // Arrange
    const whole = await image(400, 400).jpeg().toBuffer();

    // Act & Assert
    await expectAppError(processAvatar(whole.subarray(0, 200)), 422, AVATAR_MESSAGES.unsupported);
  });

  it('refuses an image over the pixel limit before decoding it', async () => {
    // Arrange: 6000 × 5000 = 30 megapixels, over the 25 MP limit.
    const huge = await image(6000, 5000).png({ compressionLevel: 9 }).toBuffer();

    // Act & Assert
    await expectAppError(processAvatar(huge), 422, AVATAR_MESSAGES.unsupported);
  });

  it('refuses more than 2 MB with 413', async () => {
    // Arrange
    const tooBig = Buffer.alloc(2 * 1024 * 1024 + 1);

    // Act & Assert
    await expectAppError(processAvatar(tooBig), 413, AVATAR_MESSAGES.tooLarge);
  });
});

describe('uploadAvatar', () => {
  it('stores the re-encoded bytes and points the profile at the versioned URL', async () => {
    // Arrange
    const updatedAt = new Date('2026-11-08T10:00:00.000Z');
    avatarDb.upsert.mockResolvedValue({ updatedAt });
    userDb.update.mockResolvedValue({ ...ME, profilePictureUrl: 'x' });
    const input = await image(500, 500).png().toBuffer();

    // Act
    await uploadAvatar(ME, input);

    // Assert
    const stored = avatarDb.upsert.mock.calls[0]![0] as { create: { image: Uint8Array } };
    expect((await sharp(Buffer.from(stored.create.image)).metadata()).format).toBe('webp');
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        profilePictureUrl: `/api/users/${USER_ID}/avatar?v=${updatedAt.getTime()}`,
        useGooglePicture: false,
      },
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      'Avatar uploaded',
    );
  });

  it('refuses a caller mid-onboarding before processing anything', async () => {
    // Arrange
    const onboarding = { ...ME, displayName: null } as User;

    // Act & Assert
    await expectAppError(uploadAvatar(onboarding, Buffer.from('x')), 403);
    expect(avatarDb.upsert).not.toHaveBeenCalled();
  });

  it('stores nothing for a file that is not an image', async () => {
    // Act & Assert
    await expectAppError(uploadAvatar(ME, Buffer.from('not an image at all')), 422);
    expect(avatarDb.upsert).not.toHaveBeenCalled();
  });
});

describe('removeOwnAvatar', () => {
  it('deletes the row and clears an uploaded URL', async () => {
    // Arrange
    const user = { ...ME, profilePictureUrl: UPLOADED_URL };
    userDb.update.mockResolvedValue({ ...user, profilePictureUrl: null });

    // Act
    const result = await removeOwnAvatar(user);

    // Assert
    expect(avatarDb.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { profilePictureUrl: null },
    });
    expect(result.profilePictureUrl).toBeNull();
  });

  it('leaves a Google photo URL alone, and is idempotent with nothing uploaded', async () => {
    // Arrange
    const user = { ...ME, profilePictureUrl: 'https://lh3.googleusercontent.com/a/x' };

    // Act
    const result = await removeOwnAvatar(user);

    // Assert
    expect(userDb.update).not.toHaveBeenCalled();
    expect(result).toBe(user);
  });
});

describe('findAvatar', () => {
  it('returns the stored bytes, or null when there are none', async () => {
    // Arrange
    avatarDb.findUnique.mockResolvedValueOnce({ image: new Uint8Array([1, 2, 3]) });
    avatarDb.findUnique.mockResolvedValueOnce(null);

    // Act & Assert
    expect(await findAvatar(USER_ID)).toEqual(Buffer.from([1, 2, 3]));
    expect(await findAvatar(USER_ID)).toBeNull();
  });
});

describe('adminRemovePhoto', () => {
  const row = {
    id: USER_ID,
    displayName: 'Ofri',
    profilePictureUrl: null,
    useGooglePicture: false,
    preferredService: 'SPOTIFY',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    role: 'USER',
    _count: { memberships: 2 },
  };
  const admin = { id: 'admin-id' } as User;

  it('removes an uploaded or Google photo, logs who did it, and returns the admin row', async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue({ id: USER_ID });
    userDb.update.mockResolvedValue(row);

    // Act
    const result = await adminRemovePhoto(admin, USER_ID);

    // Assert
    expect(avatarDb.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(userDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { profilePictureUrl: null, useGooglePicture: false } }),
    );
    expect(result).toMatchObject({ id: USER_ID, profilePictureUrl: null, communityCount: 2 });
    expect(info).toHaveBeenCalledWith(
      { adminId: 'admin-id', userId: USER_ID },
      "Admin removed a user's photo",
    );
  });

  it('is a 404 for an unknown user, touching nothing', async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(adminRemovePhoto(admin, USER_ID), 404, AVATAR_MESSAGES.userNotFound);
    expect(avatarDb.deleteMany).not.toHaveBeenCalled();
  });
});
