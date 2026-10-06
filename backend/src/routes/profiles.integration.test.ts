import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { displayNameKey } from '../services/displayName.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Find people — docs/features/find-people.md §7. The converter is mocked
 * (CLAUDE.md §10); posts and ratings are inserted directly.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({ convertLink }));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const MEMBER_USER_KEYS = ['displayName', 'id', 'profilePictureUrl'];

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string, displayName: string | null): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName,
      displayNameKey: displayName === null ? null : displayNameKey(displayName),
      preferredService: displayName === null ? null : 'TIDAL',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function communityOf(name: string, owner: Person, ...members: Person[]) {
  const community = await prisma.community.create({
    data: {
      name,
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          ...members.map((member) => ({ userId: member.id })),
        ],
      },
    },
  });
  return community.id;
}

async function ratedPost(communityId: string, rater: Person, at: Date, title = 'Hey Jude') {
  const post = await prisma.post.create({
    data: {
      authorId: rater.id,
      communityId,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: title,
      songArtist: 'The Beatles',
    },
  });
  const rating = await prisma.rating.create({
    data: { postId: post.id, userId: rater.id, score: 8, comment: 'Nice', createdAt: at },
  });
  return { postId: post.id, ratingId: rating.id };
}

const search = (who: Person, q?: string) =>
  request(app)
    .get('/api/users/search')
    .query(q === undefined ? {} : { q })
    .set('Cookie', who.cookie);
const profileOf = (who: Person, userId: string) =>
  request(app).get(`/api/users/${userId}`).set('Cookie', who.cookie);
const ratingsOf = (who: Person, userId: string, before?: string) =>
  request(app)
    .get(`/api/users/${userId}/ratings`)
    .query(before === undefined ? {} : { before })
    .set('Cookie', who.cookie);

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/users/search', () => {
  it('200: part of a name, ignoring case and accents, starts-with first, each a MemberUser', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    await person('sub-1', 'Jordan');
    await person('sub-2', 'Daní Cohen');
    await person('sub-3', 'Dana Levi');
    await person('sub-4', 'Yoni');

    // Act
    const response = await search(viewer, 'DAN');

    // Assert: prefix matches alphabetically, then the rest.
    expect(response.status).toBe(200);
    expect(response.body.data.hasMore).toBe(false);
    const users = response.body.data.users as Array<Record<string, unknown>>;
    expect(users.map((user) => user.displayName)).toEqual(['Dana Levi', 'Daní Cohen', 'Jordan']);
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual(MEMBER_USER_KEYS);
    }
  });

  it('200: includes the caller when they match, and skips users mid-onboarding', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Dana');
    await person('sub-pending', null);

    // Act
    const response = await search(viewer, 'dan');

    // Assert
    expect(response.body.data.users).toEqual([
      { id: viewer.id, displayName: 'Dana', profilePictureUrl: null },
    ]);
  });

  it('200: at most 20, with hasMore', async () => {
    // Arrange: 21 matches.
    const viewer = await person('sub-viewer', 'Ofri');
    for (let i = 1; i <= 21; i++) {
      await person(`sub-${i}`, `Fp Tester ${String(i).padStart(2, '0')}`);
    }

    // Act
    const response = await search(viewer, 'fp tester');

    // Assert
    expect(response.body.data.users).toHaveLength(20);
    expect(response.body.data.hasMore).toBe(true);
  });

  it('200: wildcards match themselves', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    await person('sub-1', 'Dan_x');
    await person('sub-2', 'Danax');

    // Act
    const underscore = await search(viewer, 'n_x');
    const percent = await search(viewer, '%');

    // Assert
    expect(
      underscore.body.data.users.map((user: { displayName: string }) => user.displayName),
    ).toEqual(['Dan_x']);
    expect(percent.body.data.users).toEqual([]);
  });

  it('200: a query no name can contain finds nobody', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');

    // Act
    const emoji = await search(viewer, '🎸!?');
    const marks = await search(viewer, '́');

    // Assert
    expect(emoji.status).toBe(200);
    expect(emoji.body.data).toEqual({ users: [], hasMore: false });
    expect(marks.status).toBe(200);
    expect(marks.body.data.users).toEqual([]);
  });

  it('422: no q, a blank q, a q over 200 characters, or an unknown key', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');

    // Act
    const missing = await search(viewer);
    const blank = await search(viewer, '   ');
    const long = await search(viewer, 'a'.repeat(201));
    const extra = await request(app)
      .get('/api/users/search')
      .query({ q: 'dan', page: '2' })
      .set('Cookie', viewer.cookie);

    // Assert
    expect(missing.status).toBe(422);
    expect(missing.body.message).toBe('Type a name to search.');
    expect(blank.status).toBe(422);
    expect(blank.body.message).toBe('Type a name to search.');
    expect(long.status).toBe(422);
    expect(extra.status).toBe(422);
  });

  it('401 signed out; 403 mid-onboarding', async () => {
    // Arrange
    const pending = await person('sub-pending', null);

    // Act
    const signedOut = await request(app).get('/api/users/search').query({ q: 'dan' });
    const onboarding = await search(pending, 'dan');

    // Assert
    expect(signedOut.status).toBe(401);
    expect(onboarding.status).toBe(403);
  });
});

describe('GET /api/users/:userId', () => {
  it('200: exactly the ProfileUser keys', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    const response = await profileOf(viewer, dana.id);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: dana.id,
      displayName: 'Dana Levi',
      profilePictureUrl: null,
      preferredService: 'TIDAL',
    });
  });

  it('404: a malformed id, an unknown id, a user mid-onboarding; 401 signed out', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    const pending = await person('sub-pending', null);

    // Act
    const malformed = await profileOf(viewer, 'not-a-uuid');
    const unknown = await profileOf(viewer, UNKNOWN_UUID);
    const onboarding = await profileOf(viewer, pending.id);
    const signedOut = await request(app).get(`/api/users/${viewer.id}`);

    // Assert
    for (const response of [malformed, unknown, onboarding]) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found.');
    }
    expect(signedOut.status).toBe(401);
  });
});

describe('GET /api/users/:userId/ratings', () => {
  it("200: only ratings in the viewer's communities, including one the target left", async () => {
    // Arrange: viewer and Dana share Crew and Old; Dana left Old; Other is Dana's alone.
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    const crew = await communityOf('Crew', viewer, dana);
    const old = await communityOf('Old', viewer, dana);
    const other = await communityOf('Other', dana);
    const inCrew = await ratedPost(crew, dana, new Date('2026-10-06T10:00:00Z'), 'Hey Jude');
    const inOld = await ratedPost(old, dana, new Date('2026-10-06T11:00:00Z'), 'Let It Be');
    await ratedPost(other, dana, new Date('2026-10-06T12:00:00Z'), 'Secret');
    await prisma.communityMember.delete({
      where: { userId_communityId: { userId: dana.id, communityId: old } },
    });

    // Act
    const response = await ratingsOf(viewer, dana.id);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.nextCursor).toBeNull();
    expect(response.body.data.items).toEqual([
      {
        id: inOld.ratingId,
        score: 8,
        comment: 'Nice',
        createdAt: '2026-10-06T11:00:00.000Z',
        community: { id: old, name: 'Old' },
        post: {
          id: inOld.postId,
          sourceService: 'SPOTIFY',
          kind: 'TRACK',
          title: 'Let It Be',
          artist: 'The Beatles',
          coverArtUrl: null,
          conversionPending: false,
        },
      },
      expect.objectContaining({ id: inCrew.ratingId, community: { id: crew, name: 'Crew' } }),
    ]);
  });

  it('200: a community the viewer left drops out', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    const crew = await communityOf('Crew', dana, viewer);
    await ratedPost(crew, dana, new Date());
    await prisma.communityMember.delete({
      where: { userId_communityId: { userId: viewer.id, communityId: crew } },
    });

    // Act
    const response = await ratingsOf(viewer, dana.id);

    // Assert
    expect(response.body.data.items).toEqual([]);
  });

  it('200: pages of 20 with nextCursor, then the rest', async () => {
    // Arrange: 21 ratings, one second apart.
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    const crew = await communityOf('Crew', dana, viewer);
    for (let i = 0; i < 21; i++) {
      await ratedPost(crew, dana, new Date(Date.UTC(2026, 9, 6, 10, 0, i)), `Song ${i}`);
    }

    // Act
    const first = await ratingsOf(viewer, dana.id);
    const second = await ratingsOf(viewer, dana.id, first.body.data.nextCursor as string);

    // Assert
    expect(first.body.data.items).toHaveLength(20);
    expect(first.body.data.items[0].post.title).toBe('Song 20');
    expect(first.body.data.nextCursor).toEqual(expect.any(String));
    expect(
      second.body.data.items.map((item: { post: { title: string } }) => item.post.title),
    ).toEqual(['Song 0']);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('200: empty for a stranger', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await ratedPost(await communityOf('Crew', dana), dana, new Date());

    // Act
    const response = await ratingsOf(viewer, dana.id);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], nextCursor: null });
  });

  it('422 bad cursor; 404 unknown target; 401 signed out', async () => {
    // Arrange
    const viewer = await person('sub-viewer', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    const badCursor = await ratingsOf(viewer, dana.id, 'not-a-cursor');
    const unknown = await ratingsOf(viewer, UNKNOWN_UUID);
    const signedOut = await request(app).get(`/api/users/${dana.id}/ratings`);

    // Assert
    expect(badCursor.status).toBe(422);
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('User not found.');
    expect(signedOut.status).toBe(401);
  });
});
