import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  ALREADY_CONVERTED,
  AUTHOR_ONLY,
  AUTHOR_OR_ADMIN,
  createPost,
  decodeCursor,
  deletePost,
  encodeCursor,
  POST_NOT_FOUND,
  retryConversion,
} from './post.service.js';
import { INVALID_LINK } from './supportedLinks.js';

/**
 * Unit tests for the branches an integration test cannot reach on demand: a
 * membership or post that disappears while the conversion runs. The ordinary
 * paths are proven end to end in routes/posts.integration.test.ts.
 */

const { db, convertLink } = vi.hoisted(() => ({
  db: {
    communityMember: { findUnique: vi.fn() },
    post: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  convertLink: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./linkScraper.service.js', () => ({ convertLink }));

const USER = { id: '11111111-1111-4111-8111-111111111111' } as User;
const COMMUNITY = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Song',
  artist: 'Band',
  coverArtUrl: null,
  links: { SPOTIFY: TRACK },
};

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(db));
  convertLink.mockResolvedValue(CONVERTED);
});

describe('createPost', () => {
  it('refuses a wrong-shaped link without converting it', async () => {
    // Act & Assert
    await expectAppError(
      createPost(USER, COMMUNITY, {
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      }),
      422,
      INVALID_LINK,
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('refuses a too-long comment without converting', async () => {
    // Act & Assert
    await expectAppError(
      createPost(USER, COMMUNITY, { url: TRACK, comment: 'a'.repeat(281) }),
      422,
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it("refuses squigly's not_found and saves nothing", async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 422, INVALID_LINK);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('is a 404 when the membership is gone by the time the conversion ends', async () => {
    // Arrange: removed while squigly was working.
    db.$queryRaw.mockResolvedValue([]);

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 404);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('is a 404 when the community was deleted meanwhile (foreign key)', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    db.post.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );

    // Act & Assert
    await expectAppError(createPost(USER, COMMUNITY, { url: TRACK }), 404);
  });

  it('passes any other database error on', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    db.post.create.mockRejectedValue(new Error('connection lost'));

    // Act & Assert
    await expect(createPost(USER, COMMUNITY, { url: TRACK })).rejects.toThrow('connection lost');
  });
});

describe('retryConversion', () => {
  const pending = {
    id: POST_ID,
    authorId: USER.id,
    communityId: COMMUNITY,
    originalUrl: TRACK,
    sourceService: 'SPOTIFY',
    conversionPending: true,
  };

  it('is a 404 when the post disappears while converting', async () => {
    // Arrange: found, then deleted (or its author removed) before the re-read.
    db.post.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);
  });

  it('checks membership before authorship, and authorship before state', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ ...pending, authorId: 'someone-else' });

    // Act & Assert
    await expectAppError(retryConversion(USER, POST_ID), 403, AUTHOR_ONLY);

    db.post.findUnique.mockResolvedValue({ ...pending, conversionPending: false });
    await expectAppError(retryConversion(USER, POST_ID), 409, ALREADY_CONVERTED);

    db.communityMember.findUnique.mockResolvedValue(null);
    await expectAppError(retryConversion(USER, POST_ID), 404, POST_NOT_FOUND);
  });
});

describe('cursors', () => {
  it('round-trips a post position', () => {
    // Arrange
    const position = { createdAt: new Date('2026-10-04T10:00:00.123Z'), id: POST_ID };

    // Act & Assert
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it.each([
    ['garbage', 'not base64 JSON'],
    [Buffer.from('{"a":1}').toString('base64url'), 'an object'],
    [Buffer.from('["nope","x"]').toString('base64url'), 'bad date and id'],
    [Buffer.from(`["2026-10-04T10:00:00.000Z","not-a-uuid"]`).toString('base64url'), 'bad id'],
  ])('rejects %s (%s) with 422', (raw) => {
    // Act & Assert
    expect(() => decodeCursor(raw)).toThrow(AppError);
  });
});

describe('deletePost', () => {
  const someoneElses = { authorId: 'someone-else', communityId: COMMUNITY };

  it.each([
    ['the author, as a plain member', { authorId: USER.id, communityId: COMMUNITY }, 'MEMBER'],
    ["an admin, on someone else's post", someoneElses, 'ADMIN'],
    ["the owner, on someone else's post", someoneElses, 'OWNER'],
  ])('lets %s delete', async (_who, post, role) => {
    // Arrange
    db.post.findUnique.mockResolvedValue(post);
    db.communityMember.findUnique.mockResolvedValue({ role });
    db.post.deleteMany.mockResolvedValue({ count: 1 });

    // Act
    await deletePost(USER, POST_ID);

    // Assert
    expect(db.post.deleteMany).toHaveBeenCalledWith({ where: { id: POST_ID } });
  });

  it("refuses a plain member on someone else's post, without deleting", async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue(someoneElses);

    // Act & Assert
    await expectAppError(deletePost(USER, POST_ID), 403, AUTHOR_OR_ADMIN);
    expect(db.post.deleteMany).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown post and for a caller outside its community', async () => {
    // Arrange, Act & Assert — unknown
    db.post.findUnique.mockResolvedValue(null);
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);

    // Arrange, Act & Assert — not a member
    db.post.findUnique.mockResolvedValue(someoneElses);
    db.communityMember.findUnique.mockResolvedValue(null);
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);
    expect(db.post.deleteMany).not.toHaveBeenCalled();
  });

  it('is a 404 when someone else deleted it between the check and the delete', async () => {
    // Arrange
    db.post.findUnique.mockResolvedValue({ authorId: USER.id, communityId: COMMUNITY });
    db.post.deleteMany.mockResolvedValue({ count: 0 });

    // Act & Assert
    await expectAppError(deletePost(USER, POST_ID), 404, POST_NOT_FOUND);
  });
});
