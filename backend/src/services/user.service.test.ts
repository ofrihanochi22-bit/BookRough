import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkAvailability, updateProfile } from './user.service.js';

const { userDb } = vi.hoisted(() => ({
  userDb: { update: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../db/prisma.js', () => ({ prisma: { user: userDb } }));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    displayName: null,
    displayNameKey: null,
    profilePictureUrl: 'https://pic/google',
    useGooglePicture: false,
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
