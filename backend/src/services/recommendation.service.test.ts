import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import {
  countUnseen,
  FRIENDS_ONLY,
  hideRecommendation,
  listReceived,
  listSent,
  markSeen,
  RECIPIENT_ONLY,
  SELF_SEND,
  sendRecommendation,
} from './recommendation.service.js';
import type * as ProfileService from './profile.service.js';
import { INVALID_LINK } from './supportedLinks.js';

/**
 * Every service function and AppError branch, with the database and converter
 * mocked. The real queries are proven in routes/recommendations.integration.test.ts.
 */

const { db, convertLink, notifyRecommendation } = vi.hoisted(() => ({
  db: {
    communityMember: { findUnique: vi.fn() },
    friend: { count: vi.fn(), findMany: vi.fn() },
    post: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    rating: { groupBy: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  convertLink: vi.fn(),
  notifyRecommendation: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));
vi.mock('./linkScraper.service.js', () => ({ convertLink }));
vi.mock('./recommendationNotification.js', () => ({ notifyRecommendation }));
vi.mock('./profile.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProfileService>()),
  findProfileUser: vi.fn(async (id: string) => {
    if (id === UNKNOWN) {
      throw new (await import('../utils/AppError.js')).AppError('User not found.', 404);
    }
    return { id };
  }),
}));

const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const SENDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECIPIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

const sender = {
  id: SENDER,
  displayName: 'Dana',
  preferredService: 'SPOTIFY',
  recommendationsSeenAt: null,
} as User;
const recipient = { ...sender, id: RECIPIENT, displayName: 'Noam' } as User;
const onboarding = { ...sender, displayName: null, preferredService: null } as User;

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Song',
  artist: 'Band',
  coverArtUrl: null,
  links: { SPOTIFY: TRACK },
};

function row(overrides: object = {}) {
  return {
    id: POST_ID,
    authorId: SENDER,
    recipientId: RECIPIENT,
    communityId: null,
    originalUrl: TRACK,
    sourceService: 'SPOTIFY',
    kind: 'TRACK',
    songTitle: 'Song',
    songArtist: 'Band',
    songCoverArtUrl: null,
    universalLinkSpotify: TRACK,
    universalLinkApple: null,
    universalLinkYoutube: null,
    universalLinkTidal: null,
    universalLinkDeezer: null,
    textComment: null,
    conversionPending: false,
    createdAt: new Date('2026-11-02T10:00:00.000Z'),
    updatedAt: new Date('2026-11-02T10:00:00.000Z'),
    author: { id: SENDER, displayName: 'Dana', profilePictureUrl: null },
    recipient: { id: RECIPIENT, displayName: 'Noam', profilePictureUrl: null },
    bookmarks: [],
    ratings: [],
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

const input = (overrides: object = {}) => ({ recipientId: RECIPIENT, url: TRACK, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  db.friend.count.mockResolvedValue(1);
  db.friend.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(db));
  db.post.create.mockResolvedValue(row());
  db.rating.groupBy.mockResolvedValue([]);
  convertLink.mockResolvedValue(CONVERTED);
  notifyRecommendation.mockImplementation(() => undefined);
});

describe('sendRecommendation', () => {
  it('saves a converted item for a friend and notifies after the insert', async () => {
    // Act
    const post = await sendRecommendation(sender, input({ comment: 'Listen' }));

    // Assert
    expect(db.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: SENDER,
          recipientId: RECIPIENT,
          textComment: 'Listen',
          songTitle: 'Song',
          conversionPending: false,
        }) as unknown,
      }),
    );
    expect(notifyRecommendation).toHaveBeenCalledWith({
      senderId: SENDER,
      recipientId: RECIPIENT,
      postId: POST_ID,
    });
    expect(post.direct).toEqual({
      recipient: { id: RECIPIENT, displayName: 'Noam', profilePictureUrl: null },
      isFriend: true,
    });
  });

  it('saves a pending item when the conversion cannot run', async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'unavailable', reason: 'timeout' });

    // Act
    await sendRecommendation(sender, input());

    // Assert
    expect(db.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversionPending: true }) as unknown,
      }),
    );
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(sendRecommendation(onboarding, input()), 403);
  });

  it('refuses yourself', async () => {
    // Act & Assert
    await expectAppError(
      sendRecommendation(sender, input({ recipientId: SENDER })),
      422,
      SELF_SEND,
    );
  });

  it('refuses an unknown recipient', async () => {
    // Act & Assert
    await expectAppError(sendRecommendation(sender, input({ recipientId: UNKNOWN })), 404);
  });

  it('refuses a non-friend without converting', async () => {
    // Arrange
    db.friend.count.mockResolvedValue(0);

    // Act & Assert
    await expectAppError(sendRecommendation(sender, input()), 403, FRIENDS_ONLY);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('refuses when the friendship ended during the conversion, saving nothing', async () => {
    // Arrange
    db.$queryRaw.mockResolvedValue([]);

    // Act & Assert
    await expectAppError(sendRecommendation(sender, input()), 403, FRIENDS_ONLY);
    expect(db.post.create).not.toHaveBeenCalled();
    expect(notifyRecommendation).not.toHaveBeenCalled();
  });

  it('refuses a wrong-shaped link without converting', async () => {
    // Act & Assert
    await expectAppError(
      sendRecommendation(
        sender,
        input({ url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' }),
      ),
      422,
      INVALID_LINK,
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it("refuses a link squigly can't find", async () => {
    // Arrange
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act & Assert
    await expectAppError(sendRecommendation(sender, input()), 422, INVALID_LINK);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it('refuses a too-long comment without converting', async () => {
    // Act & Assert
    await expectAppError(
      sendRecommendation(sender, input({ comment: 'x'.repeat(281) })),
      422,
      'Comments can be up to 280 characters.',
    );
    expect(convertLink).not.toHaveBeenCalled();
  });

  it('a failing notification never fails the send', async () => {
    // Arrange
    notifyRecommendation.mockImplementation(() => {
      throw new Error('channel down');
    });

    // Act
    const post = await sendRecommendation(sender, input());

    // Assert
    expect(post.id).toBe(POST_ID);
  });
});

describe('listReceived and listSent', () => {
  it('Received reads what was sent to the caller and is not hidden, with one friendship query', async () => {
    // Arrange
    db.post.findMany.mockResolvedValue([row(), row({ id: 'post-2' })]);
    db.friend.findMany.mockResolvedValue([{ requesterId: SENDER, addresseeId: RECIPIENT }]);

    // Act
    const page = await listReceived(recipient);

    // Assert
    expect(db.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: RECIPIENT, recipientHiddenAt: null },
      }),
    );
    expect(db.friend.findMany).toHaveBeenCalledTimes(1);
    expect(page.posts.map((post) => post.direct?.isFriend)).toEqual([true, true]);
    expect(page.nextCursor).toBeNull();
  });

  it('Sent reads direct items only, and marks an ended friendship', async () => {
    // Arrange
    db.post.findMany.mockResolvedValue([row()]);

    // Act
    const page = await listSent(sender);

    // Assert
    expect(db.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: SENDER, recipientId: { not: null } } }),
    );
    expect(page.posts[0]?.direct?.isFriend).toBe(false);
  });

  it('gives a cursor only when there is another page, and applies it', async () => {
    // Arrange
    db.post.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, n) =>
        row({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}` }),
      ),
    );

    // Act
    const first = await listReceived(recipient);
    await listReceived(recipient, first.nextCursor ?? undefined);

    // Assert
    expect(first.posts).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const [, call] = db.post.findMany.mock.calls as Array<[{ where: { OR?: unknown[] } }]>;
    expect(call?.[0].where.OR).toHaveLength(2);
  });

  it('refuses a malformed cursor', async () => {
    // Act & Assert
    await expectAppError(listReceived(recipient, 'nope'), 422);
    await expectAppError(listSent(sender, 'nope'), 422);
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(listReceived(onboarding), 403);
    await expectAppError(listSent(onboarding), 403);
  });
});

describe('countUnseen and markSeen', () => {
  it('counts everything not hidden until Received was first opened', async () => {
    // Arrange
    db.post.count.mockResolvedValue(3);

    // Act
    const count = await countUnseen(recipient);

    // Assert
    expect(count).toBe(3);
    expect(db.post.count).toHaveBeenCalledWith({
      where: { recipientId: RECIPIENT, recipientHiddenAt: null },
    });
  });

  it('counts only what arrived after it was last opened', async () => {
    // Arrange
    const seenAt = new Date('2026-11-02T09:00:00.000Z');
    db.post.count.mockResolvedValue(1);

    // Act
    await countUnseen({ ...recipient, recommendationsSeenAt: seenAt });

    // Assert
    expect(db.post.count).toHaveBeenCalledWith({
      where: { recipientId: RECIPIENT, recipientHiddenAt: null, createdAt: { gt: seenAt } },
    });
  });

  it('markSeen records the time on the caller only', async () => {
    // Act
    await markSeen(recipient);

    // Assert
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: RECIPIENT },
      data: { recommendationsSeenAt: expect.any(Date) as Date },
    });
  });

  it('both refuse a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(countUnseen(onboarding), 403);
    await expectAppError(markSeen(onboarding), 403);
  });
});

describe('hideRecommendation', () => {
  beforeEach(() => {
    db.post.findUnique.mockResolvedValue({
      authorId: SENDER,
      communityId: null,
      recipientId: RECIPIENT,
    });
  });

  it('sets the column only if it is not set yet', async () => {
    // Act
    await hideRecommendation(recipient, POST_ID);

    // Assert
    expect(db.post.updateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, recipientHiddenAt: null },
      data: { recipientHiddenAt: expect.any(Date) as Date },
    });
  });

  it('refuses the sender', async () => {
    // Act & Assert
    await expectAppError(hideRecommendation(sender, POST_ID), 403, RECIPIENT_ONLY);
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it('is a 404 for a third party, an unknown post and a community post', async () => {
    // Arrange
    const third = { ...sender, id: UNKNOWN } as User;

    // Act & Assert
    await expectAppError(hideRecommendation(third, POST_ID), 404);
    db.post.findUnique.mockResolvedValue(null);
    await expectAppError(hideRecommendation(recipient, POST_ID), 404);
    db.post.findUnique.mockResolvedValue({
      authorId: SENDER,
      communityId: 'community-1',
      recipientId: null,
    });
    db.communityMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    await expectAppError(hideRecommendation(recipient, POST_ID), 404);
  });

  it('refuses a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(hideRecommendation(onboarding, POST_ID), 403);
  });
});
