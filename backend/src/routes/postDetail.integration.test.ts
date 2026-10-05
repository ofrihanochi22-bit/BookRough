import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Post Detail and feedback — docs/features/post-detail.md §7. The converter is
 * mocked (CLAUDE.md §10); posts are inserted directly.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({ convertLink }));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string, displayName: string): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName,
      displayNameKey: displayName.toLowerCase(),
      preferredService: 'APPLE_MUSIC',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function postIn(communityId: string, author: Person, title = 'Bohemian Rhapsody') {
  const post = await prisma.post.create({
    data: {
      authorId: author.id,
      communityId,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: title,
      universalLinkSpotify: TRACK,
    },
  });
  return post.id;
}

/** Dana owns "Friday Jazz" and posted; Yoni, Ada and Eli are members; Zed is a stranger. */
async function community() {
  const [dana, yoni, ada, eli, zed] = await Promise.all([
    person('sub-dana', 'Dana'),
    person('sub-yoni', 'Yoni'),
    person('sub-ada', 'Ada'),
    person('sub-eli', 'Eli'),
    person('sub-zed', 'Zed'),
  ]);
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', dana.cookie)
    .send({ name: 'Friday Jazz' });
  const id = created.body.data.community.id as string;
  await prisma.communityMember.createMany({
    data: [yoni, ada, eli].map((member) => ({ userId: member.id, communityId: id })),
  });
  const postId = await postIn(id, dana);
  return { id, postId, dana, yoni, ada, eli, zed };
}

const rate = (who: Person, postId: string, score: number, comment?: string) =>
  request(app)
    .post(`/api/posts/${postId}/ratings`)
    .set('Cookie', who.cookie)
    .send({ score, ...(comment === undefined ? {} : { comment }) });
const show = (who: Person, postId: string) =>
  request(app).get(`/api/posts/${postId}`).set('Cookie', who.cookie);
const ratingsOf = (who: Person, postId: string) =>
  request(app).get(`/api/posts/${postId}/ratings`).set('Cookie', who.cookie);
const edit = (who: Person, postId: string, body: unknown) =>
  request(app)
    .patch(`/api/posts/${postId}/rating`)
    .set('Cookie', who.cookie)
    .send(body as object);

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/posts/:postId and /ratings', () => {
  it('200: the post with its community, and every rating newest first with the summary', async () => {
    // Arrange: 6, 7, 9 → 7.3.
    const { id, postId, dana, yoni, ada, eli } = await community();
    await rate(yoni, postId, 6, 'nise song');
    await rate(ada, postId, 7);
    await rate(eli, postId, 9, 'A classic.\nStill gives me chills.');

    // Act
    const post = await show(yoni, postId);
    const ratings = await ratingsOf(yoni, postId);
    const feed = await request(app).get(`/api/communities/${id}/posts`).set('Cookie', dana.cookie);

    // Assert
    expect(post.status).toBe(200);
    expect(post.body.data.community).toEqual({ id, name: 'Friday Jazz' });
    expect(post.body.data.post).toMatchObject({
      id: postId,
      myScore: 6,
      ratingSummary: { average: 7.3, count: 3 },
    });
    expect(ratings.status).toBe(200);
    expect(ratings.body.data.ratingSummary).toEqual({ average: 7.3, count: 3 });
    expect(
      ratings.body.data.ratings.map(
        (rating: { rater: { displayName: string }; isMine: boolean }) => [
          rating.rater.displayName,
          rating.isMine,
        ],
      ),
    ).toEqual([
      ['Eli', false],
      ['Ada', false],
      ['Yoni', true],
    ]);
    expect(ratings.body.data.ratings[0].comment).toBe('A classic.\nStill gives me chills.');
    expect(feed.body.data.posts[0].ratingSummary).toEqual({ average: 7.3, count: 3 });
  });

  it('200: no ratings yet', async () => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const ratings = await ratingsOf(yoni, postId);
    const post = await show(yoni, postId);

    // Assert
    expect(ratings.body.data).toEqual({
      ratingSummary: { average: null, count: 0 },
      ratings: [],
    });
    expect(post.body.data.post.ratingSummary).toEqual({ average: null, count: 0 });
  });

  it('401 signed out; 404 for a stranger, unknown, malformed and deleted posts, and after leaving', async () => {
    // Arrange
    const { id, postId, dana, yoni, zed } = await community();
    const gone = await postIn(id, dana, 'Gone');
    await request(app).delete(`/api/posts/${gone}`).set('Cookie', dana.cookie);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);

    // Act
    const cases = [
      [zed, postId],
      [dana, UNKNOWN_UUID],
      [dana, 'not-a-uuid'],
      [dana, gone],
      [yoni, postId],
    ] as const;
    const responses = await Promise.all(
      cases.flatMap(([who, target]) => [show(who, target), ratingsOf(who, target)]),
    );
    const signedOut = await Promise.all([
      request(app).get(`/api/posts/${postId}`),
      request(app).get(`/api/posts/${postId}/ratings`),
    ]);

    // Assert
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found.');
    }
    for (const response of signedOut) {
      expect(response.status).toBe(401);
    }
  });

  it('🔒 rating rows carry exactly the public keys, and the rater three', async () => {
    // Arrange
    const { postId, yoni } = await community();
    await rate(yoni, postId, 8);

    // Act
    const ratings = await ratingsOf(yoni, postId);

    // Assert
    const [row] = ratings.body.data.ratings;
    expect(Object.keys(row).sort()).toEqual([
      'comment',
      'createdAt',
      'id',
      'isMine',
      'rater',
      'score',
    ]);
    expect(Object.keys(row.rater).sort()).toEqual(['displayName', 'id', 'profilePictureUrl']);
  });
});

describe('PATCH /api/posts/:postId/rating', () => {
  it('200: edits your rating; the list and the summary follow', async () => {
    // Arrange
    const { postId, yoni, ada } = await community();
    await rate(yoni, postId, 6, 'nise song');
    await rate(ada, postId, 9);

    // Act
    const response = await edit(yoni, postId, { score: 9, comment: 'nice song' });
    const commentOnly = await edit(yoni, postId, { comment: '   ' });
    const ratings = await ratingsOf(ada, postId);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.rating).toMatchObject({
      score: 9,
      comment: 'nice song',
      isMine: true,
    });
    expect(commentOnly.body.data.rating).toMatchObject({ score: 9, comment: null });
    expect(ratings.body.data.ratingSummary).toEqual({ average: 9, count: 2 });
    const row = await prisma.rating.findFirstOrThrow({ where: { userId: yoni.id } });
    expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
  });

  it("404 when you haven't rated; another member's rating is never touched", async () => {
    // Arrange
    const { postId, yoni, ada } = await community();
    await rate(ada, postId, 4);

    // Act
    const response = await edit(yoni, postId, { score: 10 });

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("You haven't rated this post.");
    expect((await prisma.rating.findFirstOrThrow()).score).toBe(4);
  });

  it('401 signed out; 404 for a stranger, unknown, malformed and deleted posts, and after leaving', async () => {
    // Arrange
    const { id, postId, dana, yoni, zed } = await community();
    await rate(yoni, postId, 6);
    const gone = await postIn(id, dana, 'Gone');
    await rate(yoni, gone, 5);
    await request(app).delete(`/api/posts/${gone}`).set('Cookie', dana.cookie);

    // Act
    const stranger = await edit(zed, postId, { score: 9 });
    const unknown = await edit(yoni, UNKNOWN_UUID, { score: 9 });
    const malformed = await edit(yoni, 'not-a-uuid', { score: 9 });
    const deleted = await edit(yoni, gone, { score: 9 });
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    const afterLeaving = await edit(yoni, postId, { score: 9 });
    const signedOut = await request(app).patch(`/api/posts/${postId}/rating`).send({ score: 9 });

    // Assert
    for (const response of [stranger, unknown, malformed, deleted, afterLeaving]) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found.');
    }
    expect(signedOut.status).toBe(401);
    expect((await prisma.rating.findFirstOrThrow({ where: { postId } })).score).toBe(6);
  });

  it.each([
    [{ score: 0 }, 'Choose a score from 1 to 10.'],
    [{ score: 11 }, 'Choose a score from 1 to 10.'],
    [{ score: 7.5 }, 'Choose a score from 1 to 10.'],
    [{ comment: 'a'.repeat(281) }, 'Comments can be up to 280 characters.'],
    [{}, 'The request body is invalid.'],
    [{ score: 7, userId: UNKNOWN_UUID }, 'The request body is invalid.'],
  ])('422: %j', async (body, message) => {
    // Arrange
    const { postId, yoni } = await community();
    await rate(yoni, postId, 6);

    // Act
    const response = await edit(yoni, postId, body);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(message);
    expect((await prisma.rating.findFirstOrThrow()).score).toBe(6);
  });

  it('400: unparseable JSON', async () => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const response = await request(app)
      .patch(`/api/posts/${postId}/rating`)
      .set('Cookie', yoni.cookie)
      .set('Content-Type', 'application/json')
      .send('{"score":');

    // Assert
    expect(response.status).toBe(400);
  });
});

describe('ratings and membership (UC-14)', () => {
  it('removal deletes their ratings here only, permanently; leaving keeps them', async () => {
    // Arrange: Yoni rates here and in a second community; Ada rates here, then leaves.
    const { id, postId, dana, yoni, ada } = await community();
    await rate(yoni, postId, 2, 'terrible taste');
    await rate(ada, postId, 8);
    const other = await request(app)
      .post('/api/communities')
      .set('Cookie', dana.cookie)
      .send({ name: 'Second' });
    const otherId = other.body.data.community.id as string;
    await prisma.communityMember.create({ data: { userId: yoni.id, communityId: otherId } });
    const elsewhere = await postIn(otherId, dana);
    await rate(yoni, elsewhere, 7);

    // Act
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', ada.cookie);
    const removed = await request(app)
      .delete(`/api/communities/${id}/members/${yoni.id}`)
      .set('Cookie', dana.cookie);
    await request(app).delete(`/api/communities/${id}/bans/${yoni.id}`).set('Cookie', dana.cookie);
    const ratings = await ratingsOf(dana, postId);

    // Assert
    expect(removed.status).toBe(200);
    expect(
      ratings.body.data.ratings.map((rating: { rater: { id: string } }) => rating.rater.id),
    ).toEqual([ada.id]);
    expect(ratings.body.data.ratingSummary).toEqual({ average: 8, count: 1 });
    expect(await prisma.rating.count({ where: { postId: elsewhere } })).toBe(1);
  });

  it('My List shows no rating summary for a community you left', async () => {
    // Arrange
    const { id, postId, yoni, ada } = await community();
    await rate(ada, postId, 8);
    await request(app).put(`/api/posts/${postId}/bookmark`).set('Cookie', yoni.cookie);

    // Act
    const asMember = await request(app).get('/api/users/me/bookmarks').set('Cookie', yoni.cookie);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    const afterLeaving = await request(app)
      .get('/api/users/me/bookmarks')
      .set('Cookie', yoni.cookie);

    // Assert
    expect(asMember.body.data.items[0].post.ratingSummary).toEqual({ average: 8, count: 1 });
    expect(afterLeaving.body.data.items[0].post.ratingSummary).toEqual({
      average: null,
      count: 0,
    });
  });
});
