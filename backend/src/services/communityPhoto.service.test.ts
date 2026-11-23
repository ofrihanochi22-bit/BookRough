import { Prisma, type User } from '@prisma/client';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  adminRemoveCommunityPhoto,
  COMMUNITY_PHOTO_MESSAGES,
  findCommunityPhoto,
  removeCommunityPhoto,
  uploadCommunityPhoto,
} from './communityPhoto.service.js';

/**
 * Unit tests — docs/features/community-photo.md §7. `sharp` is real (every
 * image is generated here); Prisma, the role check and the community read are
 * mocked. The routes run against Postgres in
 * routes/communityPhoto.integration.test.ts.
 */

const { photoDb, communityDb, requireAdmin, getCommunity, info } = vi.hoisted(() => ({
  photoDb: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  communityDb: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  requireAdmin: vi.fn(),
  getCommunity: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../db/prisma.js', () => {
  const client = { communityPhoto: photoDb, community: communityDb };
  return {
    prisma: { ...client, $transaction: (run: (tx: typeof client) => unknown) => run(client) },
  };
});
vi.mock('./communityAccess.js', () => ({
  COMMUNITY_NOT_FOUND: 'Community not found.',
  requireAdmin,
}));
vi.mock('./community.service.js', () => ({ getCommunity }));
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const COMMUNITY_ID = '7a1c2e3d-4b5f-4a6e-9c8d-0e1f2a3b4c5d';
const ME = { id: 'me-id', displayName: 'Ofri' } as User;
const STAMP = new Date('2026-11-22T12:00:00.000Z');
const REFRESHED = { id: COMMUNITY_ID, photoUrl: `/api/communities/${COMMUNITY_ID}/photo?v=1` };

const png = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: '#a26' } })
    .png()
    .toBuffer();

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('gone', { code, clientVersion: 'test' });
}

beforeEach(() => {
  vi.resetAllMocks();
  getCommunity.mockResolvedValue(REFRESHED);
});

describe('uploadCommunityPhoto', () => {
  it("stores the re-encoded WebP and stamps the community with the row's time", async () => {
    // Arrange
    requireAdmin.mockResolvedValue('ADMIN');
    photoDb.upsert.mockResolvedValue({ updatedAt: STAMP });

    // Act
    const result = await uploadCommunityPhoto(ME, COMMUNITY_ID, await png());

    // Assert
    expect(requireAdmin).toHaveBeenCalledWith(
      ME,
      COMMUNITY_ID,
      COMMUNITY_PHOTO_MESSAGES.adminsOnly,
    );
    const stored = photoDb.upsert.mock.calls[0]![0] as { create: { image: Uint8Array } };
    const meta = await sharp(Buffer.from(stored.create.image)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(communityDb.update).toHaveBeenCalledWith({
      where: { id: COMMUNITY_ID },
      data: { photoUpdatedAt: STAMP },
    });
    expect(result).toBe(REFRESHED);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me-id', communityId: COMMUNITY_ID }),
      'Community photo uploaded',
    );
  });

  it('lets the owner upload too', async () => {
    // Arrange
    requireAdmin.mockResolvedValue('OWNER');
    photoDb.upsert.mockResolvedValue({ updatedAt: STAMP });

    // Act
    await uploadCommunityPhoto(ME, COMMUNITY_ID, await png());

    // Assert
    expect(photoDb.upsert).toHaveBeenCalledOnce();
  });

  it.each([
    [403, COMMUNITY_PHOTO_MESSAGES.adminsOnly],
    [404, 'Community not found.'],
  ])('passes on the role check’s %i before reading the image', async (status, message) => {
    // Arrange
    requireAdmin.mockRejectedValue(new AppError(message, status));

    // Act & Assert
    await expectAppError(uploadCommunityPhoto(ME, COMMUNITY_ID, await png()), status, message);
    expect(photoDb.upsert).not.toHaveBeenCalled();
  });

  it('refuses a file that is not an image with 422, writing nothing', async () => {
    // Arrange
    requireAdmin.mockResolvedValue('ADMIN');

    // Act & Assert
    await expectAppError(
      uploadCommunityPhoto(ME, COMMUNITY_ID, Buffer.from('<svg onload=alert(1)>')),
      422,
      COMMUNITY_PHOTO_MESSAGES.unsupported,
    );
    expect(photoDb.upsert).not.toHaveBeenCalled();
    expect(communityDb.update).not.toHaveBeenCalled();
  });

  it.each(['P2003', 'P2025'])(
    'is a 404 when the community is deleted mid-upload (%s)',
    async (code) => {
      // Arrange
      requireAdmin.mockResolvedValue('ADMIN');
      photoDb.upsert.mockRejectedValue(prismaError(code));

      // Act & Assert
      await expectAppError(uploadCommunityPhoto(ME, COMMUNITY_ID, await png()), 404);
    },
  );

  it('rethrows any other database error', async () => {
    // Arrange
    requireAdmin.mockResolvedValue('ADMIN');
    photoDb.upsert.mockRejectedValue(new Error('connection lost'));

    // Act
    const error = await uploadCommunityPhoto(ME, COMMUNITY_ID, await png()).catch(
      (caught: unknown) => caught,
    );

    // Assert
    expect(error).not.toBeInstanceOf(AppError);
  });
});

describe('removeCommunityPhoto', () => {
  it('deletes the row, clears the stamp and logs once', async () => {
    // Arrange
    requireAdmin.mockResolvedValue('ADMIN');
    photoDb.deleteMany.mockResolvedValue({ count: 1 });

    // Act
    const result = await removeCommunityPhoto(ME, COMMUNITY_ID);

    // Assert
    expect(photoDb.deleteMany).toHaveBeenCalledWith({ where: { communityId: COMMUNITY_ID } });
    expect(communityDb.updateMany).toHaveBeenCalledWith({
      where: { id: COMMUNITY_ID },
      data: { photoUpdatedAt: null },
    });
    expect(result).toBe(REFRESHED);
    expect(info).toHaveBeenCalledWith(
      { userId: 'me-id', communityId: COMMUNITY_ID },
      'Community photo removed',
    );
  });

  it('is idempotent with no photo, and logs nothing', async () => {
    // Arrange
    requireAdmin.mockResolvedValue('ADMIN');
    photoDb.deleteMany.mockResolvedValue({ count: 0 });

    // Act
    const result = await removeCommunityPhoto(ME, COMMUNITY_ID);

    // Assert
    expect(result).toBe(REFRESHED);
    expect(info).not.toHaveBeenCalled();
  });

  it.each([
    [403, COMMUNITY_PHOTO_MESSAGES.adminsOnly],
    [404, 'Community not found.'],
  ])('passes on the role check’s %i, touching nothing', async (status, message) => {
    // Arrange
    requireAdmin.mockRejectedValue(new AppError(message, status));

    // Act & Assert
    await expectAppError(removeCommunityPhoto(ME, COMMUNITY_ID), status, message);
    expect(photoDb.deleteMany).not.toHaveBeenCalled();
  });
});

describe('findCommunityPhoto', () => {
  it('returns the stored bytes as a Buffer', async () => {
    // Arrange
    photoDb.findUnique.mockResolvedValue({ image: new Uint8Array([1, 2, 3]) });

    // Act
    const image = await findCommunityPhoto(COMMUNITY_ID);

    // Assert
    expect(Buffer.isBuffer(image)).toBe(true);
    expect([...image!]).toEqual([1, 2, 3]);
  });

  it('returns null without a photo', async () => {
    // Arrange
    photoDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    expect(await findCommunityPhoto(COMMUNITY_ID)).toBeNull();
  });
});

describe('adminRemoveCommunityPhoto', () => {
  const admin = { id: 'admin-id' } as User;
  const row = {
    id: COMMUNITY_ID,
    name: 'Friday Jazz',
    photoUpdatedAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    _count: { members: 3 },
    members: [{ user: { id: 'mia', displayName: 'Mia' } }],
  };

  it('clears the photo, logs who did it, and returns the admin row', async () => {
    // Arrange
    photoDb.deleteMany.mockResolvedValue({ count: 1 });
    communityDb.findUnique.mockResolvedValue(row);

    // Act
    const result = await adminRemoveCommunityPhoto(admin, COMMUNITY_ID);

    // Assert
    expect(communityDb.updateMany).toHaveBeenCalledWith({
      where: { id: COMMUNITY_ID },
      data: { photoUpdatedAt: null },
    });
    expect(result).toMatchObject({ id: COMMUNITY_ID, photoUrl: null, memberCount: 3 });
    expect(info).toHaveBeenCalledWith(
      { adminId: 'admin-id', communityId: COMMUNITY_ID },
      "Admin removed a community's photo",
    );
  });

  it('is idempotent: no photo, no log line', async () => {
    // Arrange
    photoDb.deleteMany.mockResolvedValue({ count: 0 });
    communityDb.findUnique.mockResolvedValue(row);

    // Act
    await adminRemoveCommunityPhoto(admin, COMMUNITY_ID);

    // Assert
    expect(info).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown community', async () => {
    // Arrange
    photoDb.deleteMany.mockResolvedValue({ count: 0 });
    communityDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(adminRemoveCommunityPhoto(admin, COMMUNITY_ID), 404);
  });
});
