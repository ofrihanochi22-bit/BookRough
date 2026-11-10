import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  checkAvailability,
  GOOGLE_PHOTO_MESSAGES,
  rechooseGooglePicture,
  updateProfile,
} from './user.service.js';

const { userDb, avatarDb, verifyGoogleIdToken } = vi.hoisted(() => ({
  userDb: { update: vi.fn(), findUnique: vi.fn() },
  avatarDb: { deleteMany: vi.fn() },
  verifyGoogleIdToken: vi.fn(),
}));

// The avatar row and the user change in one transaction (avatar-upload.md §4).
vi.mock('../db/prisma.js', () => {
  const client = { user: userDb, userAvatar: avatarDb };
  return {
    prisma: { ...client, $transaction: (run: (tx: typeof client) => unknown) => run(client) },
  };
});
vi.mock('./googleIdentity.service.js', () => ({ verifyGoogleIdToken }));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    displayName: null,
    displayNameKey: null,
    profilePictureUrl: 'https://pic/google',
    useGooglePicture: false,
    recommendationsSeenAt: null,
    walkthroughSeenAt: null,
    saveTipSeenAt: null,
    listTipSeenAt: null,
    preferredService: null,
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const onboarded = () =>
  makeUser({ displayName: 'Ofri', displayNameKey: 'ofri', preferredService: 'SPOTIFY' });

beforeEach(() => {
  vi.resetAllMocks();
  userDb.update.mockImplementation(({ data }: { data: Partial<User> }) => ({
    ...makeUser(),
    ...data,
  }));
});

describe('updateProfile — onboarding', () => {
  it('saves name, key and service, and defaults to the generated avatar (photo removed)', async () => {
    // Act
    await updateProfile(makeUser(), { displayName: ' Ofri  H. ', preferredService: 'TIDAL' });

    // Assert
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        displayName: 'Ofri H.',
        displayNameKey: 'ofri h.',
        preferredService: 'TIDAL',
        useGooglePicture: false,
        profilePictureUrl: null,
      },
    });
  });

  it('keeps the Google photo when the user chooses it', async () => {
    // Act
    await updateProfile(makeUser(), {
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
      useGooglePicture: true,
    });

    // Assert
    const { data } = userDb.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.useGooglePicture).toBe(true);
    expect(data).not.toHaveProperty('profilePictureUrl');
  });

  it.each([
    ['without a service', { displayName: 'Ofri' }],
    ['without a name', { preferredService: 'SPOTIFY' as const }],
  ])('rejects a save %s with 422', async (_label, update) => {
    // Act & Assert
    await expect(updateProfile(makeUser(), update)).rejects.toMatchObject({ statusCode: 422 });
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid name with its rule message', async () => {
    // Act & Assert
    await expect(
      updateProfile(makeUser(), { displayName: 'a', preferredService: 'SPOTIFY' }),
    ).rejects.toMatchObject({ statusCode: 422, message: 'Use 2–20 characters.' });
  });

  it('rejects a reserved name', async () => {
    // Act & Assert
    await expect(
      updateProfile(makeUser(), { displayName: 'Admín', preferredService: 'SPOTIFY' }),
    ).rejects.toMatchObject({ statusCode: 422, message: 'That name is reserved.' });
  });

  it('rejects choosing the Google photo when there is none', async () => {
    // Act & Assert
    await expect(
      updateProfile(makeUser({ profilePictureUrl: null }), {
        displayName: 'Ofri',
        preferredService: 'SPOTIFY',
        useGooglePicture: true,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('turns a unique-key collision into 409 "already taken"', async () => {
    // Arrange
    userDb.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    // Act & Assert
    await expect(
      updateProfile(makeUser(), { displayName: 'Ofri', preferredService: 'SPOTIFY' }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'That display name is already taken.' });
  });

  it('rethrows any other database error', async () => {
    // Arrange
    userDb.update.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(
      updateProfile(makeUser(), { displayName: 'Ofri', preferredService: 'SPOTIFY' }),
    ).rejects.toThrow('connection lost');
  });
});

describe('updateProfile — after onboarding (settings)', () => {
  it('changes only the service, leaving the avatar alone', async () => {
    // Act
    await updateProfile(onboarded(), { preferredService: 'DEEZER' });

    // Assert
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { preferredService: 'DEEZER' },
    });
  });

  it('removes the photo when the generated avatar is chosen later', async () => {
    // Act
    await updateProfile(onboarded(), { useGooglePicture: false });

    // Assert
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { useGooglePicture: false, profilePictureUrl: null },
    });
  });
});

describe('checkAvailability', () => {
  it('reports a free name as available', async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expect(checkAvailability(makeUser(), 'Ofri')).resolves.toEqual({
      available: true,
      reason: null,
    });
    expect(userDb.findUnique).toHaveBeenCalledWith({
      where: { displayNameKey: 'ofri' },
      select: { id: true },
    });
  });

  it("reports the caller's own name as available", async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue({ id: 'user-1' });

    // Act & Assert
    await expect(checkAvailability(makeUser(), 'OFRI')).resolves.toEqual({
      available: true,
      reason: null,
    });
  });

  it("reports someone else's name as taken", async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue({ id: 'someone-else' });

    // Act & Assert
    await expect(checkAvailability(makeUser(), 'Ofri')).resolves.toEqual({
      available: false,
      reason: 'taken',
    });
  });

  it('reports a reserved name without querying', async () => {
    // Act & Assert
    await expect(checkAvailability(makeUser(), 'Support')).resolves.toEqual({
      available: false,
      reason: 'reserved',
    });
    expect(userDb.findUnique).not.toHaveBeenCalled();
  });

  it('throws 422 for a name that breaks the rules', async () => {
    // Act & Assert
    await expect(checkAvailability(makeUser(), 'a<b')).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('rechooseGooglePicture', () => {
  const declined = () =>
    makeUser({
      displayName: 'Ofri',
      displayNameKey: 'ofri',
      preferredService: 'SPOTIFY',
      profilePictureUrl: null,
      useGooglePicture: false,
    });

  it('stores only the token picture and sets the flag', async () => {
    // Arrange
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/fresh' });

    // Act
    const user = await rechooseGooglePicture(declined(), 'credential');

    // Assert
    expect(verifyGoogleIdToken).toHaveBeenCalledWith('credential');
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { profilePictureUrl: 'https://pic/fresh', useGooglePicture: true },
    });
    expect(user.profilePictureUrl).toBe('https://pic/fresh');
  });

  it('refuses a caller who has not finished onboarding, before asking Google (403)', async () => {
    // Act
    const attempt = rechooseGooglePicture(makeUser(), 'credential');

    // Assert
    await expect(attempt).rejects.toMatchObject({ statusCode: 403 });
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it('maps a rejected token to 422, so the session survives', async () => {
    // Arrange
    verifyGoogleIdToken.mockRejectedValue(new AppError('Google sign-in failed.', 401));

    // Act
    const attempt = rechooseGooglePicture(declined(), 'credential');

    // Assert
    await expect(attempt).rejects.toMatchObject({
      statusCode: 422,
      message: GOOGLE_PHOTO_MESSAGES.failed,
    });
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('passes "Google unavailable" through as 503', async () => {
    // Arrange
    verifyGoogleIdToken.mockRejectedValue(new AppError('Unavailable.', 503));

    // Act
    const attempt = rechooseGooglePicture(declined(), 'credential');

    // Assert
    await expect(attempt).rejects.toMatchObject({ statusCode: 503 });
  });

  it('refuses a different Google account (403)', async () => {
    // Arrange
    verifyGoogleIdToken.mockResolvedValue({ sub: 'someone-else', picture: 'https://pic/x' });

    // Act
    const attempt = rechooseGooglePicture(declined(), 'credential');

    // Assert
    await expect(attempt).rejects.toMatchObject({
      statusCode: 403,
      message: GOOGLE_PHOTO_MESSAGES.otherAccount,
    });
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('refuses an account with no photo (422)', async () => {
    // Arrange
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: null });

    // Act
    const attempt = rechooseGooglePicture(declined(), 'credential');

    // Assert
    await expect(attempt).rejects.toMatchObject({
      statusCode: 422,
      message: GOOGLE_PHOTO_MESSAGES.noPhoto,
    });
    expect(userDb.update).not.toHaveBeenCalled();
  });
});

/** Leaving an upload deletes it — docs/features/avatar-upload.md §4. */
describe('uploaded photos when switching avatar', () => {
  it('Use generated avatar deletes an uploaded photo with the user change', async () => {
    // Arrange
    const user = makeUser({
      displayName: 'Ofri',
      displayNameKey: 'ofri',
      preferredService: 'SPOTIFY',
      profilePictureUrl: '/api/users/0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40/avatar?v=1',
    });
    userDb.update.mockResolvedValue({ ...user, profilePictureUrl: null });

    // Act
    await updateProfile(user, { useGooglePicture: false });

    // Assert
    expect(avatarDb.deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
  });

  it('a save that does not touch the avatar leaves the upload alone', async () => {
    // Arrange
    const user = makeUser({
      displayName: 'Ofri',
      displayNameKey: 'ofri',
      preferredService: 'SPOTIFY',
    });
    userDb.update.mockResolvedValue({ ...user, preferredService: 'DEEZER' });

    // Act
    await updateProfile(user, { preferredService: 'DEEZER' });

    // Assert
    expect(avatarDb.deleteMany).not.toHaveBeenCalled();
  });

  it('re-choosing the Google photo deletes an uploaded one', async () => {
    // Arrange
    const user = makeUser({
      displayName: 'Ofri',
      displayNameKey: 'ofri',
      preferredService: 'SPOTIFY',
    });
    verifyGoogleIdToken.mockResolvedValue({ sub: user.googleSub, picture: 'https://pic/g' });
    userDb.update.mockResolvedValue({ ...user, profilePictureUrl: 'https://pic/g' });

    // Act
    await rechooseGooglePicture(user, 'credential');

    // Assert
    expect(avatarDb.deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { profilePictureUrl: 'https://pic/g', useGooglePicture: true },
    });
  });
});
