import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { encodeCursor } from './post.service.js';
import {
  EMPTY_QUERY,
  getProfile,
  listProfileRatings,
  SEARCH_LIMIT,
  searchUsers,
  USER_NOT_FOUND,
} from './profile.service.js';

/**
 * Every branch of the profile service, Prisma mocked. Matching itself (case,
 * accents, wildcards, ordering) is proven against Postgres in
 * routes/profiles.integration.test.ts; here are the branches and the queries.
 */

const { db } = vi.hoisted(() => ({
  db: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    rating: { findMany: vi.fn() },
  },
}));

vi.mock('../db/prisma.js', () => ({ prisma: db }));

const VIEWER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ofri',
  preferredService: 'SPOTIFY',
} as User;
const ONBOARDING = { ...VIEWER, displayName: null, preferredService: null } as User;
const TARGET = '22222222-2222-4222-8222-222222222222';

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

const member = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  displayName: `Fp Tester ${n}`,
  profilePictureUrl: null,
});

const target = {
  id: TARGET,
  displayName: 'Dana Levi',
  profilePictureUrl: null,
  preferredService: 'TIDAL',
};

function ratingRow(id: string, createdAt: Date) {
  return {
    id,
    score: 7,
    comment: null,
    createdAt,
    post: {
      id: '33333333-3333-4333-8333-333333333333',
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: 'Hey Jude',
      songArtist: 'The Beatles',
      songCoverArtUrl: null,
      conversionPending: false,
      community: { id: '44444444-4444-4444-8444-444444444444', name: 'Crew' },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('searchUsers', () => {
  it('asks for prefix matches first, then the rest, on the escaped name key', async () => {
    // Arrange
    db.user.findMany.mockResolvedValueOnce([member(1)]).mockResolvedValueOnce([member(2)]);

    // Act
    const result = await searchUsers(VIEWER, '  DÁNA_% ');

    // Assert: cleaned, keyed (lower case, no accent), wildcards escaped.
    expect(result).toEqual({ users: [member(1), member(2)], hasMore: false });
    const [prefixQuery, restQuery] = db.user.findMany.mock.calls.map((call) => call[0]);
    expect(prefixQuery.where.displayNameKey).toEqual({ startsWith: 'dana\\_\\%' });
    expect(prefixQuery.take).toBe(SEARCH_LIMIT + 1);
    expect(restQuery.where.AND).toEqual([
      { displayNameKey: { contains: 'dana\\_\\%' } },
      { NOT: { displayNameKey: { startsWith: 'dana\\_\\%' } } },
    ]);
    expect(restQuery.take).toBe(SEARCH_LIMIT);
    expect(prefixQuery.select).toEqual({ id: true, displayName: true, profilePictureUrl: true });
  });

  it('skips the second query when the prefix matches already fill the page, and says there is more', async () => {
    // Arrange: 21 prefix matches.
    db.user.findMany.mockResolvedValueOnce(Array.from({ length: 21 }, (_, i) => member(i)));

    // Act
    const result = await searchUsers(VIEWER, 'fp');

    // Assert
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(result.users).toHaveLength(SEARCH_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it('says there is no more at exactly 20 matches', async () => {
    // Arrange: 15 prefix + 5 contains.
    db.user.findMany
      .mockResolvedValueOnce(Array.from({ length: 15 }, (_, i) => member(i)))
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => member(100 + i)));

    // Act
    const result = await searchUsers(VIEWER, 'fp');

    // Assert
    expect(db.user.findMany.mock.calls[1]![0].take).toBe(6);
    expect(result.users).toHaveLength(20);
    expect(result.hasMore).toBe(false);
  });

  it('only searches onboarded users', async () => {
    // Arrange
    db.user.findMany.mockResolvedValue([]);

    // Act
    await searchUsers(VIEWER, 'dana');

    // Assert
    for (const [query] of db.user.findMany.mock.calls) {
      expect(query.where).toMatchObject({
        displayName: { not: null },
        preferredService: { not: null },
      });
    }
  });

  it('finds nobody, without a query, for only combining marks or joiners', async () => {
    // Act
    const result = await searchUsers(VIEWER, '́‍');

    // Assert
    expect(result).toEqual({ users: [], hasMore: false });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('throws 422 for a query that is blank after cleaning', async () => {
    // Act & Assert
    await expectAppError(searchUsers(VIEWER, ' \t '), 422, EMPTY_QUERY);
  });

  it('throws 403 for a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(searchUsers(ONBOARDING, 'dana'), 403, 'Finish your profile first.');
  });
});

describe('getProfile', () => {
  it('returns the profile of an onboarded user', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(target);

    // Act
    const profile = await getProfile(VIEWER, TARGET);

    // Assert
    expect(profile).toEqual(target);
    expect(db.user.findFirst.mock.calls[0]![0].where).toMatchObject({
      id: TARGET,
      displayNameKey: { not: null },
    });
  });

  it('throws 404 for an unknown user, or one mid-onboarding', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValueOnce(null);

    // Act & Assert
    await expectAppError(getProfile(VIEWER, TARGET), 404, USER_NOT_FOUND);
  });

  it('throws 403 for a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(getProfile(ONBOARDING, TARGET), 403);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('listProfileRatings', () => {
  it("returns the target's ratings in the viewer's communities, newest first, with the next cursor", async () => {
    // Arrange: 21 rows → a full page and a cursor.
    db.user.findFirst.mockResolvedValue(target);
    const rows = Array.from({ length: 21 }, (_, i) =>
      ratingRow(`r${String(i).padStart(2, '0')}`, new Date(Date.UTC(2026, 9, 6, 12, 0, 60 - i))),
    );
    db.rating.findMany.mockResolvedValue(rows);

    // Act
    const page = await listProfileRatings(VIEWER, TARGET);

    // Assert
    const query = db.rating.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({
      userId: TARGET,
      post: { community: { members: { some: { userId: VIEWER.id } } } },
    });
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(page.items).toHaveLength(20);
    expect(page.items[0]).toMatchObject({ id: 'r00', community: { name: 'Crew' } });
    expect(page.nextCursor).toBe(encodeCursor(rows[19]!));
  });

  it('pages after the cursor, ties broken by id', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(target);
    db.rating.findMany.mockResolvedValue([]);
    const at = new Date('2026-10-06T10:00:00.000Z');
    const id = '55555555-5555-4555-8555-555555555555';

    // Act
    const page = await listProfileRatings(VIEWER, TARGET, encodeCursor({ createdAt: at, id }));

    // Assert
    expect(db.rating.findMany.mock.calls[0]![0].where.OR).toEqual([
      { createdAt: { lt: at } },
      { createdAt: at, id: { lt: id } },
    ]);
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('is an empty page, not an error, for a stranger', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(target);
    db.rating.findMany.mockResolvedValue([]);

    // Act & Assert
    await expect(listProfileRatings(VIEWER, TARGET)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('throws 404 for an unknown target', async () => {
    // Arrange
    db.user.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expectAppError(listProfileRatings(VIEWER, TARGET), 404, USER_NOT_FOUND);
    expect(db.rating.findMany).not.toHaveBeenCalled();
  });

  it('throws 422 for a cursor that does not decode', async () => {
    // Act & Assert
    await expectAppError(listProfileRatings(VIEWER, TARGET, 'not-a-cursor'), 422);
  });

  it('throws 403 for a caller mid-onboarding', async () => {
    // Act & Assert
    await expectAppError(listProfileRatings(ONBOARDING, TARGET), 403);
  });
});
