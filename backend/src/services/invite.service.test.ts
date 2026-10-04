import { Prisma, type Community, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  ADMINS_ONLY,
  INVITE_INVALID,
  acceptInvite,
  getInvite,
  previewInvite,
  resetInvite,
} from './invite.service.js';

const { communityDb, memberDb, banDb } = vi.hoisted(() => ({
  communityDb: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  memberDb: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), create: vi.fn() },
  banDb: { findUnique: vi.fn() },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { community: communityDb, communityMember: memberDb, communityBan: banDb },
}));

const TOKEN = 'qEP_iUKg0kWils3eSHVHZQ';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    displayName: 'Ofri',
    displayNameKey: 'ofri',
    profilePictureUrl: null,
    useGooglePicture: false,
    preferredService: 'SPOTIFY',
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-1',
    name: 'Friday Jazz',
    description: null,
    inviteToken: TOKEN,
    createdAt: new Date('2026-10-04T09:00:00.000Z'),
    updatedAt: new Date('2026-10-04T09:00:00.000Z'),
    ...overrides,
  };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

/** The caller's membership, as requireAdmin reads it. */
function callerIs(role: 'ADMIN' | 'MEMBER' | null) {
  memberDb.findUnique.mockResolvedValue(role ? { role } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
  communityDb.updateMany.mockResolvedValue({ count: 1 });
  banDb.findUnique.mockResolvedValue(null);
});

describe('getInvite', () => {
  it('returns the existing token without writing', async () => {
    // Arrange
    callerIs('ADMIN');
    communityDb.findUniqueOrThrow.mockResolvedValue({ inviteToken: TOKEN });

    // Act & Assert
    expect(await getInvite(makeUser(), 'community-1')).toEqual({ token: TOKEN });
    expect(communityDb.updateMany).not.toHaveBeenCalled();
  });

  it('creates a token on first request, only while none exists, and returns what was stored', async () => {
    // Arrange
    callerIs('ADMIN');
    communityDb.findUniqueOrThrow
      .mockResolvedValueOnce({ inviteToken: null })
      .mockResolvedValueOnce({ inviteToken: 'stored-token' });

    // Act
    const invite = await getInvite(makeUser(), 'community-1');

    // Assert
    expect(communityDb.updateMany).toHaveBeenCalledWith({
      where: { id: 'community-1', inviteToken: null },
      data: { inviteToken: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) },
    });
    // Whatever landed first — ours or a racing admin's — is what is returned.
    expect(invite).toEqual({ token: 'stored-token' });
  });

  it('retries once with a fresh token on a unique-key collision', async () => {
    // Arrange
    callerIs('ADMIN');
    communityDb.findUniqueOrThrow
      .mockResolvedValueOnce({ inviteToken: null })
      .mockResolvedValueOnce({ inviteToken: 'second-try' });
    communityDb.updateMany
      .mockRejectedValueOnce(prismaError('P2002'))
      .mockResolvedValueOnce({ count: 1 });

    // Act & Assert
    expect(await getInvite(makeUser(), 'community-1')).toEqual({ token: 'second-try' });
    expect(communityDb.updateMany).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry and rethrows', async () => {
    // Arrange
    callerIs('ADMIN');
    communityDb.findUniqueOrThrow.mockResolvedValue({ inviteToken: null });
    communityDb.updateMany.mockRejectedValue(prismaError('P2002'));

    // Act & Assert
    await expect(getInvite(makeUser(), 'community-1')).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('gives a plain member 403 and never creates a token', async () => {
    // Arrange
    callerIs('MEMBER');

    // Act & Assert
    await expectAppError(getInvite(makeUser(), 'community-1'), 403, ADMINS_ONLY);
    expect(communityDb.updateMany).not.toHaveBeenCalled();
  });

  it('gives a non-member 404', async () => {
    // Arrange
    callerIs(null);

    // Act & Assert
    await expectAppError(getInvite(makeUser(), 'community-1'), 404, 'Community not found.');
  });
});

describe('resetInvite', () => {
  it('writes a new token unconditionally and returns it', async () => {
    // Arrange
    callerIs('ADMIN');
    communityDb.findUniqueOrThrow.mockResolvedValue({ inviteToken: 'brand-new' });

    // Act
    const invite = await resetInvite(makeUser(), 'community-1');

    // Assert
    expect(communityDb.updateMany).toHaveBeenCalledWith({
      where: { id: 'community-1' },
      data: { inviteToken: expect.any(String) },
    });
    expect(invite).toEqual({ token: 'brand-new' });
  });

  it.each([
    ['MEMBER', 403],
    [null, 404],
  ] as const)('rejects a caller whose role is %s with %i', async (role, status) => {
    // Arrange
    callerIs(role);

    // Act & Assert
    await expectAppError(resetInvite(makeUser(), 'community-1'), status);
    expect(communityDb.updateMany).not.toHaveBeenCalled();
  });
});

describe('previewInvite', () => {
  beforeEach(() => {
    communityDb.findUnique.mockResolvedValue({ ...makeCommunity(), _count: { members: 3 } });
  });

  it('shows name, count and id to a signed-out visitor', async () => {
    // Act
    const preview = await previewInvite(TOKEN, null);

    // Assert
    expect(preview).toEqual({
      communityId: 'community-1',
      name: 'Friday Jazz',
      memberCount: 3,
      alreadyMember: false,
    });
    expect(memberDb.count).not.toHaveBeenCalled();
  });

  it.each([
    [1, true],
    [0, false],
  ])('reports alreadyMember for a signed-in caller (count %i → %s)', async (count, expected) => {
    // Arrange
    memberDb.count.mockResolvedValue(count);

    // Act
    const preview = await previewInvite(TOKEN, makeUser());

    // Assert
    expect(preview.alreadyMember).toBe(expected);
  });

  it('answers an unknown token with the UC-15 message', async () => {
    // Arrange
    communityDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(previewInvite(TOKEN, null), 404, INVITE_INVALID);
  });

  it.each(['%%%', 'x'.repeat(65), undefined])(
    'answers a malformed token %j with the same 404, without querying',
    async (token) => {
      // Act & Assert
      await expectAppError(previewInvite(token, null), 404, INVITE_INVALID);
      expect(communityDb.findUnique).not.toHaveBeenCalled();
    },
  );
});

describe('acceptInvite', () => {
  function membershipRow(role: 'ADMIN' | 'MEMBER', members: number) {
    return { role, community: { ...makeCommunity(), _count: { members } } };
  }

  beforeEach(() => {
    communityDb.findUnique.mockResolvedValue({ id: 'community-1' });
  });

  it('adds the caller as MEMBER and reports joined', async () => {
    // Arrange
    memberDb.findUniqueOrThrow.mockResolvedValue(membershipRow('MEMBER', 2));

    // Act
    const result = await acceptInvite(makeUser(), TOKEN);

    // Assert
    expect(memberDb.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', communityId: 'community-1', role: 'MEMBER' },
    });
    expect(result.joined).toBe(true);
    expect(result.community).toMatchObject({ id: 'community-1', memberCount: 2, myRole: 'MEMBER' });
  });

  it('is idempotent for an existing member: P2002 means "already in", role unchanged', async () => {
    // Arrange
    memberDb.create.mockRejectedValue(prismaError('P2002'));
    memberDb.findUniqueOrThrow.mockResolvedValue(membershipRow('ADMIN', 1));

    // Act
    const result = await acceptInvite(makeUser(), TOKEN);

    // Assert
    expect(result.joined).toBe(false);
    expect(result.community.myRole).toBe('ADMIN');
  });

  it('turns a community deleted mid-way (P2003) into the invalid-link 404', async () => {
    // Arrange
    memberDb.create.mockRejectedValue(prismaError('P2003'));

    // Act & Assert
    await expectAppError(acceptInvite(makeUser(), TOKEN), 404, INVITE_INVALID);
  });

  it('rethrows any other database error', async () => {
    // Arrange
    memberDb.create.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(acceptInvite(makeUser(), TOKEN)).rejects.toThrow('connection lost');
  });

  it('rejects an unknown or malformed token with 404', async () => {
    // Arrange
    communityDb.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(acceptInvite(makeUser(), TOKEN), 404, INVITE_INVALID);
    await expectAppError(acceptInvite(makeUser(), '%%%'), 404, INVITE_INVALID);
    expect(memberDb.create).not.toHaveBeenCalled();
  });

  it('rejects a user who has not finished onboarding with 403', async () => {
    // Act & Assert
    await expectAppError(
      acceptInvite(makeUser({ preferredService: null }), TOKEN),
      403,
      'Finish your profile first.',
    );
    expect(memberDb.create).not.toHaveBeenCalled();
  });
});
