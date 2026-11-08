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
    recommendationsSeenAt: null,
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

  it('does not store a new Google photo for an onboarded user who declined it', async () => {
    // Arrange
    const declined = makeUser({
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
      profilePictureUrl: null,
      useGooglePicture: false,
    });
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(declined);

    // Act
    const result = await authenticateWithGoogle('credential');

    // Assert
    expect(result.user).toBe(declined);
    expect(userDb.update).not.toHaveBeenCalled();
  });

  it('clears a leftover photo for an onboarded user who declined it', async () => {
    // Arrange
    const declined = makeUser({
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
      profilePictureUrl: 'https://pic/old',
      useGooglePicture: false,
    });
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(declined);
    userDb.update.mockResolvedValue({ ...declined, profilePictureUrl: null });

    // Act
    await authenticateWithGoogle('credential');

    // Assert
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: declined.id },
      data: { profilePictureUrl: null },
    });
  });

  it('refreshes the photo for an onboarded user who chose it', async () => {
    // Arrange
    const chose = makeUser({
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
      useGooglePicture: true,
    });
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(chose);
    userDb.update.mockResolvedValue({ ...chose, profilePictureUrl: 'https://pic/new' });

    // Act
    await authenticateWithGoogle('credential');

    // Assert
    expect(userDb.update).toHaveBeenCalledWith({
      where: { id: chose.id },
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

/** The two intents — docs/features/sign-in-sign-up.md §7. */
describe('authenticateWithGoogle — intent', () => {
  beforeEach(() => {
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/old' });
  });

  it('signin with an account signs in', async () => {
    // Arrange
    const user = makeUser();
    userDb.findUnique.mockResolvedValue(user);

    // Act
    const result = await authenticateWithGoogle('token', 'signin');

    // Assert
    expect(result).toEqual({ user, isNewUser: false });
  });

  it('signin without an account is a 404 and creates nothing', async () => {
    // Arrange
    userDb.findUnique.mockResolvedValue(null);

    // Act
    const error = await authenticateWithGoogle('token', 'signin').catch(
      (caught: unknown) => caught,
    );

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 404,
      message: 'No account for this Google account yet.',
    });
    expect(userDb.create).not.toHaveBeenCalled();
  });

  it('signup without an account creates it', async () => {
    // Arrange
    const created = makeUser();
    userDb.findUnique.mockResolvedValue(null);
    userDb.create.mockResolvedValue(created);

    // Act
    const result = await authenticateWithGoogle('token', 'signup');

    // Assert
    expect(result).toEqual({ user: created, isNewUser: true });
  });

  it('signup with an account signs into it, creating nothing', async () => {
    // Arrange
    const user = makeUser();
    userDb.findUnique.mockResolvedValue(user);

    // Act
    const result = await authenticateWithGoogle('token', 'signup');

    // Assert
    expect(result).toEqual({ user, isNewUser: false });
    expect(userDb.create).not.toHaveBeenCalled();
  });

  it('no intent keeps find-or-create, for a client cached before the split', async () => {
    // Arrange
    const created = makeUser();
    userDb.findUnique.mockResolvedValue(null);
    userDb.create.mockResolvedValue(created);

    // Act
    const result = await authenticateWithGoogle('token');

    // Assert
    expect(result.isNewUser).toBe(true);
  });

  it('signup racing another first sign-in lands on the same account, not new', async () => {
    // Arrange
    const existing = makeUser();
    userDb.findUnique.mockResolvedValue(null);
    userDb.create.mockRejectedValue(uniqueViolation());
    userDb.findUniqueOrThrow.mockResolvedValue(existing);

    // Act
    const result = await authenticateWithGoogle('token', 'signup');

    // Assert
    expect(result).toEqual({ user: existing, isNewUser: false });
  });
});

describe('authenticateWithGoogle — an uploaded photo (avatar-upload.md §3)', () => {
  it('never touches an uploaded photo on sign-in', async () => {
    // Arrange
    const uploaded = '/api/users/a3b0c6a2-3c55-4d0f-8f7e-1d9a6c2e5b10/avatar?v=1700000000000';
    const user = makeUser({
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
      profilePictureUrl: uploaded,
    });
    verifyGoogleIdToken.mockResolvedValue({ sub: 'sub-1', picture: 'https://pic/new' });
    userDb.findUnique.mockResolvedValue(user);

    // Act
    const result = await authenticateWithGoogle('token', 'signin');

    // Assert
    expect(result).toEqual({ user, isNewUser: false });
    expect(userDb.update).not.toHaveBeenCalled();
  });
});
