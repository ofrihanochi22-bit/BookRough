import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { authenticateWithGoogle, findSessionUser } from './auth.service.js';

const { userDb, verifyGoogleIdToken } = vi.hoisted(() => ({
  userDb: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: { user: userDb } }));
vi.mock('./googleIdentity.service.js', () => ({ verifyGoogleIdToken }));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'a3b0c6a2-3c55-4d0f-8f7e-1d9a6c2e5b10',
    googleSub: 'sub-1',
    displayName: null,
    displayNameKey: null,
    profilePictureUrl: 'https://pic/old',
    useGooglePicture: false,
    preferredService: null,
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('authenticateWithGoogle', () => {
  it('creates a user for an unknown sub, storing only sub and picture', async () => {
    // Arrange
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(null);
    const created = makeUser({ profilePictureUrl: 'https://pic/new' });
    userDb.create.mockResolvedValue(created);

    // Act
    const result = await authenticateWithGoogle('credential');

    // Assert
    expect(result).toEqual({ user: created, isNewUser: true });
    expect(userDb.create).toHaveBeenCalledWith({
      data: { googleSub: 'sub-1', profilePictureUrl: 'https://pic/new' },
    });
  });

  it('returns the existing user for a known sub without writing when the picture is unchanged', async () => {
    // Arrange
    const existing = makeUser();
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/old' });
    userDb.findUnique.mockResolvedValue(existing);

    // Act
    const result = await authenticateWithGoogle('credential');

    // Assert
    expect(result).toEqual({ user: existing, isNewUser: false });
    expect(userDb.create).not.toHaveBeenCalled();
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('refreshes the picture of a known user when Google sends a new one', async () => {
    // Arrange
    const existing = makeUser();
    const refreshed = makeUser({ profilePictureUrl: 'https://pic/new' });
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(existing);
    userDb.update.mockResolvedValue(refreshed);

    // Act
    const result = await authenticateWithGoogle('credential');

    // Assert
    expect(result).toEqual({ user: refreshed, isNewUser: false });
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { profilePictureUrl: 'https://pic/new' },
    });
  });

  it('falls back to the existing row when a concurrent sign-in created it first (P2002)', async () => {
    // Arrange
    const raced = makeUser();
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: null });
    userDb.findUnique.mockResolvedValue(null);
    userDb.create.mockRejectedValue(uniqueViolation());
    userDb.findUniqueOrThrow.mockResolvedValue(raced);

    // Act
    const result = await authenticateWithGoogle('credential');

    // Assert
    expect(result).toEqual({ user: raced, isNewUser: false });
    expect(userDb.findUniqueOrThrow).toHaveBeenCalledWith({ where: { googleSub: 'sub-1' } });
  });

  it('rethrows any other database error', async () => {
    // Arrange
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: null });
    userDb.findUnique.mockResolvedValue(null);
    userDb.create.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(authenticateWithGoogle('credential')).rejects.toThrow('connection lost');
  });

  it('propagates a verification failure without touching the database', async () => {
    // Arrange
    verifyGoogleIdToken.mockRejectedValue(new AppError('Google sign-in failed.', 401));

    // Act & Assert
    await expect(authenticateWithGoogle('credential')).rejects.toMatchObject({ statusCode: 401 });
    expect(userDb.findUnique).not.toHaveBeenCalled();
  });
});

describe('findSessionUser', () => {
  it('looks the user up by id', async () => {
    // Arrange
    const user = makeUser();
    userDb.findUnique.mockResolvedValue(user);

    // Act
    const found = await findSessionUser(user.id);

    // Assert
    expect(found).toBe(user);
    expect(userDb.findUnique).toHaveBeenCalledWith({ where: { id: user.id } });
  });

  it('returns null for a user that no longer exists', async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expect(findSessionUser('gone')).resolves.toBeNull();
  });
});
