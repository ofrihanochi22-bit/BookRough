import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { POST_NOT_FOUND } from './communityAccess.js';
import { checkPostAccess, requirePostAccess } from './postAccess.js';

const { db } = vi.hoisted(() => ({
  db: {
    communityMember: { findUnique: vi.fn() },
    post: { findUnique: vi.fn() },
  },
}));
vi.mock('../db/prisma.js', () => ({ prisma: db }));

const member = { id: 'viewer' } as User;
const POST_ID = '33333333-3333-4333-8333-333333333333';
const communityPost = { authorId: 'author', communityId: 'community', recipientId: null };
const directPost = { authorId: 'sender', communityId: null, recipientId: 'recipient' };

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode: 404, message: POST_NOT_FOUND });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('checkPostAccess', () => {
  it('gives a current member the community scope and their role', async () => {
    // Arrange
    db.communityMember.findUnique.mockResolvedValue({ role: 'ADMIN' });

    // Act
    const access = await checkPostAccess(member, communityPost);

    // Assert
    expect(access).toEqual({
      scope: 'COMMUNITY',
      authorId: 'author',
      communityId: 'community',
      role: 'ADMIN',
    });
  });

  it('is a 404 for someone not in the community', async () => {
    // Arrange
    db.communityMember.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectNotFound(checkPostAccess(member, communityPost));
  });

  it('gives the sender and the recipient the direct scope, with no membership read', async () => {
    // Act
    const forSender = await checkPostAccess({ id: 'sender' } as User, directPost);
    const forRecipient = await checkPostAccess({ id: 'recipient' } as User, directPost);

    // Assert
    expect(forSender).toEqual({
      scope: 'DIRECT',
      authorId: 'sender',
      recipientId: 'recipient',
      isRecipient: false,
    });
    expect(forRecipient).toMatchObject({ scope: 'DIRECT', isRecipient: true });
    expect(db.communityMember.findUnique).not.toHaveBeenCalled();
  });

  it('is a 404 for a third party on a direct item', async () => {
    // Act & Assert
    await expectNotFound(checkPostAccess(member, directPost));
  });

  it('is a 404 for a row with no target, which the database refuses anyway', async () => {
    // Act & Assert
    await expectNotFound(
      checkPostAccess({ id: 'author' } as User, {
        authorId: 'author',
        communityId: null,
        recipientId: null,
      }),
    );
  });
});

describe('requirePostAccess', () => {
  it('reads the post, then applies the rule', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue(directPost);

    // Act
    const access = await requirePostAccess({ id: 'sender' } as User, POST_ID);

    // Assert
    expect(access.scope).toBe('DIRECT');
  });

  it('is the same 404 for a missing post', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expectNotFound(requirePostAccess(member, POST_ID));
  });
});
