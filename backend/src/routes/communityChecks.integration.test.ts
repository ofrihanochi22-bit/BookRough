import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { PAGE_SIZE } from '../utils/cursor.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * From communities — docs/features/community-unchecked.md §7, against a real
 * database: the rule is raw SQL, so this is where it is proven.
 */

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const HOUR = 60 * 60 * 1000;

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string, onboarded = true): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName: onboarded ? googleSub : null,
      displayNameKey: onboarded ? googleSub : null,
      preferredService: onboarded ? 'SPOTIFY' : null,
      // The clean start, an hour ago: posts from before it never count.
      communityChecksSince: new Date(Date.now() - HOUR),
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function community(name: string, members: Array<{ who: Person; joinedAt?: Date }>) {
  return prisma.community.create({
    data: {
      name,
      members: {
        create: members.map(({ who, joinedAt }, index) => ({
          userId: who.id,
          role: index === 0 ? 'OWNER' : 'MEMBER',
          joinedAt: joinedAt ?? new Date(Date.now() - 2 * HOUR),
        })),
      },
    },
  });
}

async function post(
  author: Person,
  target: { communityId: string } | { recipientId: string },
  createdAt = new Date(),
): Promise<string> {
  const created = await prisma.post.create({
    data: {
      authorId: author.id,
      ...target,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      songTitle: 'Song',
      createdAt,
    },
  });
  return created.id;
}

const list = (who: Person, query = '') =>
  request(app).get(`/api/recommendations/community${query}`).set('Cookie', who.cookie);
const count = async (who: Person) =>
  (await request(app).get('/api/recommendations/community/count').set('Cookie', who.cookie)).body
    .data.count as number;
const check = (who: Person, postId: string) =>
  request(app).put(`/api/recommendations/community/${postId}/checked`).set('Cookie', who.cookie);
const uncheck = (who: Person, postId: string) =>
  request(app).delete(`/api/recommendations/community/${postId}/checked`).set('Cookie', who.cookie);

const ids = (response: { body: { data: { items: Array<{ post: { id: string } }> } } }) =>
  response.body.data.items.map((item) => item.post.id);

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/recommendations/community', () => {
  it("lists other members' posts across communities, newest first, with each community", async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const jazz = await community('Friday Jazz', [{ who: dana }, { who: noam }]);
    const rock = await community('Rock', [{ who: noam }, { who: dana }]);
    const older = await post(noam, { communityId: jazz.id }, new Date(Date.now() - 60_000));
    const newer = await post(noam, { communityId: rock.id });

    // Act
    const response = await list(dana);

    // Assert
    expect(response.status).toBe(200);
    expect(ids(response)).toEqual([newer, older]);
    expect(response.body.data.items[0].community).toEqual({ id: rock.id, name: 'Rock' });
    expect(response.body.data.items[0].post.isMine).toBe(false);
    expect(response.body.data.nextCursor).toBeNull();
    expect(await count(dana)).toBe(2);
  });

  it('leaves out own posts, direct items, posts from before joining or the clean start, and left communities', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const joinedNow = new Date();
    const jazz = await community('Jazz', [{ who: noam }, { who: dana }]);
    const late = await community('Late', [{ who: noam }, { who: dana, joinedAt: joinedNow }]);
    const left = await community('Left', [{ who: noam }]);
    const kept = await post(noam, { communityId: jazz.id });
    await post(dana, { communityId: jazz.id });
    await post(noam, { recipientId: dana.id });
    await post(noam, { communityId: jazz.id }, new Date(Date.now() - 2 * HOUR));
    await post(noam, { communityId: late.id }, new Date(joinedNow.getTime() - 60_000));
    await post(noam, { communityId: left.id });

    // Act
    const response = await list(dana);

    // Assert
    expect(ids(response)).toEqual([kept]);
    expect(await count(dana)).toBe(1);
  });

  it('pages with a cursor and never repeats a post', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const jazz = await community('Jazz', [{ who: noam }, { who: dana }]);
    const base = Date.now() - 30 * 60_000;
    for (let index = 0; index <= PAGE_SIZE; index += 1) {
      await post(noam, { communityId: jazz.id }, new Date(base + index * 1000));
    }

    // Act
    const first = await list(dana);
    const second = await list(dana, `?before=${first.body.data.nextCursor as string}`);

    // Assert
    expect(ids(first)).toHaveLength(PAGE_SIZE);
    expect(ids(second)).toHaveLength(1);
    expect(ids(first)).not.toContain(ids(second)[0]);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('gives a community admin Delete on the card, and a member none', async () => {
    // Arrange
    const [dana, noam, zed] = await Promise.all([person('dana'), person('noam'), person('zed')]);
    const jazz = await community('Jazz', [{ who: dana }, { who: noam }, { who: zed }]);
    await post(noam, { communityId: jazz.id });

    // Act
    const [owner, member] = await Promise.all([list(dana), list(zed)]);

    // Assert
    expect(owner.body.data.items[0].post.canDelete).toBe(true);
    expect(member.body.data.items[0].post.canDelete).toBe(false);
  });

  it('422 for a malformed cursor or an unknown query key', async () => {
    // Arrange
    const dana = await person('dana');

    // Act
    const [cursor, unknown] = await Promise.all([list(dana, '?before=nope'), list(dana, '?x=1')]);

    // Assert
    expect(cursor.status).toBe(422);
    expect(unknown.status).toBe(422);
  });
});

describe('PUT and DELETE /api/recommendations/community/:postId/checked', () => {
  it('checks a post off the list, idempotently, and Undo brings it back', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const jazz = await community('Jazz', [{ who: noam }, { who: dana }]);
    const postId = await post(noam, { communityId: jazz.id });

    // Act
    const first = await check(dana, postId);
    const again = await check(dana, postId);
    const afterCheck = await count(dana);
    const undone = await uncheck(dana, postId);
    const undoneAgain = await uncheck(dana, postId);

    // Assert
    expect([first.status, again.status, undone.status, undoneAgain.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(afterCheck).toBe(0);
    expect(ids(await list(dana))).toEqual([postId]);
  });

  it("is a no-op on the caller's own post", async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const jazz = await community('Jazz', [{ who: dana }, { who: noam }]);
    const postId = await post(dana, { communityId: jazz.id });

    // Act
    const response = await check(dana, postId);

    // Assert
    expect(response.status).toBe(200);
    expect(await prisma.communityPostCheck.count()).toBe(0);
  });

  it('rating or saving through their own endpoints checks the post; unsaving does not undo it', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    const jazz = await community('Jazz', [{ who: noam }, { who: dana }]);
    const rated = await post(noam, { communityId: jazz.id });
    const saved = await post(noam, { communityId: jazz.id });

    // Act
    await request(app)
      .post(`/api/posts/${rated}/ratings`)
      .set('Cookie', dana.cookie)
      .send({ score: 7 })
      .expect(201);
    await request(app).put(`/api/posts/${saved}/bookmark`).set('Cookie', dana.cookie).expect(200);
    await request(app)
      .delete(`/api/posts/${saved}/bookmark`)
      .set('Cookie', dana.cookie)
      .expect(200);

    // Assert
    expect(await count(dana)).toBe(0);
  });

  it('404 for a missing post, a malformed id, a direct recommendation, and a non-member', async () => {
    // Arrange
    const [dana, noam, zed] = await Promise.all([person('dana'), person('noam'), person('zed')]);
    const jazz = await community('Jazz', [{ who: noam }, { who: dana }]);
    const postId = await post(noam, { communityId: jazz.id });
    const direct = await post(noam, { recipientId: dana.id });

    // Act
    const responses = await Promise.all([
      check(dana, UNKNOWN_UUID),
      check(dana, 'not-a-uuid'),
      check(dana, direct),
      uncheck(dana, direct),
      check(zed, postId),
      uncheck(zed, postId),
    ]);

    // Assert
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
  });
});

describe('auth on all four', () => {
  it('401 without a session, 403 before onboarding', async () => {
    // Arrange
    const [noam, fresh] = await Promise.all([person('noam'), person('fresh', false)]);
    const jazz = await community('Jazz', [{ who: noam }, { who: fresh }]);
    const postId = await post(noam, { communityId: jazz.id });
    const paths = [
      ['get', '/api/recommendations/community'],
      ['get', '/api/recommendations/community/count'],
      ['put', `/api/recommendations/community/${postId}/checked`],
      ['delete', `/api/recommendations/community/${postId}/checked`],
    ] as const;

    // Act
    const signedOut = await Promise.all(paths.map(([method, path]) => request(app)[method](path)));
    const onboarding = await Promise.all(
      paths.map(([method, path]) => request(app)[method](path).set('Cookie', fresh.cookie)),
    );

    // Assert
    expect(signedOut.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(onboarding.map((response) => response.status)).toEqual([403, 403, 403, 403]);
  });
});
