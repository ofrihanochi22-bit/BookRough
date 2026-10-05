import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Rating a post — docs/features/rate-post.md §7. The converter is mocked
 * (CLAUDE.md §10); posts are inserted directly.
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

/** Dana owns "Friday Jazz" and has shared one post; Yoni and Ada are members, Zed a stranger. */
async function community() {
  const [dana, yoni, ada, zed] = await Promise.all([
    person('sub-dana', 'Dana'),
    person('sub-yoni', 'Yoni'),
    person('sub-ada', 'Ada'),
    person('sub-zed', 'Zed'),
  ]);
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', dana.cookie)
    .send({ name: 'Friday Jazz' });
  const id = created.body.data.community.id as string;
  await prisma.communityMember.createMany({
    data: [
      { userId: yoni.id, communityId: id },
      { userId: ada.id, communityId: id },
    ],
  });
  const post = await prisma.post.create({
    data: {
      authorId: dana.id,
      communityId: id,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: 'Bohemian Rhapsody',
      songArtist: 'Queen',
      universalLinkSpotify: TRACK,
    },
  });
  return { id, postId: post.id, dana, yoni, ada, zed };
}

const rate = (who: Person, postId: string, body: unknown = { score: 8 }) =>
  request(app)
    .post(`/api/posts/${postId}/ratings`)
    .set('Cookie', who.cookie)
    .send(body as object);
const save = (who: Person, postId: string) =>
  request(app).put(`/api/posts/${postId}/bookmark`).set('Cookie', who.cookie);
const feed = (who: Person, id: string) =>
  request(app).get(`/api/communities/${id}/posts`).set('Cookie', who.cookie);

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/posts/:postId/ratings', () => {
  it('201: saves the rating and takes the song off the rater’s list only', async () => {
    // Arrange: Yoni and Ada both saved Dana's post.
    const { postId, yoni, ada } = await community();
    await save(yoni, postId);
    await save(ada, postId);

    // Act
    const response = await rate(yoni, postId, { score: 8, comment: ' Still sounds fresh ' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.rating).toEqual({
      id: expect.any(String),
      score: 8,
      comment: 'Still sounds fresh',
      createdAt: expect.any(String),
    });
    expect(Object.keys(response.body.data.rating).sort()).toEqual([
      'comment',
      'createdAt',
      'id',
      'score',
    ]);
    const row = await prisma.rating.findFirstOrThrow();
    expect(row).toMatchObject({ postId, userId: yoni.id, score: 8 });
    const yonisList = await request(app).get('/api/users/me/bookmarks').set('Cookie', yoni.cookie);
    expect(yonisList.body.data.items).toEqual([]);
    expect(await prisma.bookmark.count({ where: { userId: ada.id } })).toBe(1);
  });

  it('201 without a bookmark; the feed shows the score to the rater only', async () => {
    // Arrange
    const { id, postId, dana, yoni, ada } = await community();

    // Act
    const response = await rate(yoni, postId, { score: 3, comment: null });
    const [asYoni, asAda, asDana] = await Promise.all([
      feed(yoni, id),
      feed(ada, id),
      feed(dana, id),
    ]);

    // Assert
    expect(response.status).toBe(201);
    expect(asYoni.body.data.posts[0].myScore).toBe(3);
    expect(asAda.body.data.posts[0].myScore).toBeNull();
    expect(asDana.body.data.posts[0].myScore).toBeNull();
  });

  it('409: a second rating; saving a rated post is 409 too', async () => {
    // Arrange
    const { postId, yoni } = await community();
    await rate(yoni, postId);

    // Act
    const again = await rate(yoni, postId, { score: 2 });
    const saved = await save(yoni, postId);

    // Assert
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('You already rated this post.');
    expect(saved.status).toBe(409);
    expect(saved.body.message).toBe('You already rated this post.');
    expect(await prisma.rating.count()).toBe(1);
  });

  it.each([
    [{ score: 0 }, 'Choose a score from 1 to 10.'],
    [{ score: 11 }, 'Choose a score from 1 to 10.'],
    [{ score: 7.5 }, 'Choose a score from 1 to 10.'],
    [{ score: '7' }, 'Choose a score from 1 to 10.'],
    [{}, 'Choose a score from 1 to 10.'],
    [{ score: 7, comment: 'a'.repeat(281) }, 'Comments can be up to 280 characters.'],
    [{ score: 7, userId: UNKNOWN_UUID }, 'The request body is invalid.'],
  ])('422: %j', async (body, message) => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const response = await rate(yoni, postId, body);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(message);
    expect(await prisma.rating.count()).toBe(0);
  });

  it('400: unparseable JSON', async () => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const response = await request(app)
      .post(`/api/posts/${postId}/ratings`)
      .set('Cookie', yoni.cookie)
      .set('Content-Type', 'application/json')
      .send('{"score":');

    // Assert
    expect(response.status).toBe(400);
  });

  it('401 signed out; 403 your own post', async () => {
    // Arrange
    const { postId, dana } = await community();

    // Act
    const signedOut = await request(app).post(`/api/posts/${postId}/ratings`).send({ score: 8 });
    const own = await rate(dana, postId);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(own.status).toBe(403);
    expect(own.body.message).toBe("You can't rate your own post.");
    expect(await prisma.rating.count()).toBe(0);
  });

  it('404 for a stranger, unknown, malformed and deleted posts, and after leaving or removal', async () => {
    // Arrange
    const { id, postId, dana, yoni, ada, zed } = await community();
    const gone = await prisma.post.create({
      data: { authorId: dana.id, communityId: id, originalUrl: TRACK, sourceService: 'SPOTIFY' },
    });
    await request(app).delete(`/api/posts/${gone.id}`).set('Cookie', dana.cookie);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    await request(app)
      .delete(`/api/communities/${id}/members/${ada.id}`)
      .set('Cookie', dana.cookie);

    // Act
    const responses = await Promise.all([
      rate(zed, postId),
      rate(dana, UNKNOWN_UUID),
      rate(dana, 'not-a-uuid'),
      rate(zed, gone.id),
      rate(yoni, postId),
      rate(ada, postId),
    ]);

    // Assert
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found.');
    }
    expect(await prisma.rating.count()).toBe(0);
  });
});

describe('ratings and the rest of the data', () => {
  it('leaving keeps the rating; deleting the post deletes it', async () => {
    // Arrange
    const { id, postId, dana, yoni } = await community();
    await rate(yoni, postId);

    // Act
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    const afterLeaving = await prisma.rating.count();
    await request(app).delete(`/api/posts/${postId}`).set('Cookie', dana.cookie);

    // Assert
    expect(afterLeaving).toBe(1);
    expect(await prisma.rating.count()).toBe(0);
  });

  it('deleting the community or the rater’s account deletes the rating', async () => {
    // Arrange: two communities, Yoni rates in both.
    const first = await community();
    await rate(first.yoni, first.postId);
    const other = await request(app)
      .post('/api/communities')
      .set('Cookie', first.ada.cookie)
      .send({ name: 'Second' });
    const otherId = other.body.data.community.id as string;
    await prisma.communityMember.create({ data: { userId: first.yoni.id, communityId: otherId } });
    const otherPost = await prisma.post.create({
      data: {
        authorId: first.ada.id,
        communityId: otherId,
        originalUrl: TRACK,
        sourceService: 'SPOTIFY',
      },
    });
    await rate(first.yoni, otherPost.id);

    // Act
    await request(app).delete(`/api/communities/${first.id}`).set('Cookie', first.dana.cookie);
    const afterCommunity = await prisma.rating.count();
    await prisma.user.delete({ where: { id: first.yoni.id } });

    // Assert
    expect(afterCommunity).toBe(1);
    expect(await prisma.rating.count()).toBe(0);
  });

  it('the database refuses a score outside 1–10 even past the API', async () => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const write = prisma.rating.create({ data: { postId, userId: yoni.id, score: 11 } });

    // Assert
    await expect(write).rejects.toThrow(/ratings_score_range/);
  });

  it('🔒 feed and My List carry only the viewer’s own score', async () => {
    // Arrange: Yoni rates, Ada saves.
    const { id, postId, yoni, ada } = await community();
    await rate(yoni, postId, { score: 9 });
    await save(ada, postId);

    // Act
    const adasList = await request(app).get('/api/users/me/bookmarks').set('Cookie', ada.cookie);
    const adasFeed = await feed(ada, id);

    // Assert
    expect(adasList.body.data.items[0].post.myScore).toBeNull();
    expect(adasFeed.body.data.posts[0].myScore).toBeNull();
    expect(JSON.stringify(adasFeed.body)).not.toContain('"score"');
  });
});
