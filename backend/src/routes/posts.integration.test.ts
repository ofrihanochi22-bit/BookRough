import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * The converter is mocked: integration tests never launch Chromium (CLAUDE.md
 * §10). Real squigly.link interaction belongs to the nightly E2E run.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({ convertLink }));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const INVALID_LINK =
  "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service.";
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  coverArtUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
  links: {
    SPOTIFY: TRACK,
    APPLE_MUSIC: 'https://music.apple.com/us/album/x/1?i=2',
    YOUTUBE: 'https://music.youtube.com/watch?v=BSTsnWoslP4',
    TIDAL: 'https://tidal.com/browse/track/1',
    DEEZER: 'https://www.deezer.com/track/1',
  },
};
const UNAVAILABLE = { outcome: 'unavailable', reason: 'timeout' };

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

/** Dana owns "Friday Jazz", Yoni is a member, Zed is a stranger. */
async function community() {
  const [dana, yoni, zed] = await Promise.all([
    person('sub-dana', 'Dana'),
    person('sub-yoni', 'Yoni'),
    person('sub-zed', 'Zed'),
  ]);
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', dana.cookie)
    .send({ name: 'Friday Jazz' });
  const id = created.body.data.community.id as string;
  const invite = await request(app).get(`/api/communities/${id}/invite`).set('Cookie', dana.cookie);
  await request(app)
    .post(`/api/invites/${invite.body.data.invite.token as string}/accept`)
    .set('Cookie', yoni.cookie);
  return { id, dana, yoni, zed };
}

const posts = (id: string) => `/api/communities/${id}/posts`;

function post(id: string, who: Person, body: object = { url: TRACK }) {
  return request(app).post(posts(id)).set('Cookie', who.cookie).send(body);
}

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
  convertLink.mockResolvedValue(CONVERTED);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/communities/:id/posts', () => {
  it('201: saves a converted post with its metadata and all five links', async () => {
    // Arrange
    const { id, yoni } = await community();

    // Act
    const response = await post(id, yoni, { url: `  ${TRACK} `, comment: ' A classic \n' });

    // Assert
    expect(response.status).toBe(201);
    expect(convertLink).toHaveBeenCalledWith(TRACK, 'SPOTIFY');
    expect(response.body.data.post).toMatchObject({
      author: { id: yoni.id, displayName: 'Yoni', profilePictureUrl: null },
      isMine: true,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      links: CONVERTED.links,
      comment: 'A classic',
      conversionPending: false,
    });
    const row = await prisma.post.findFirstOrThrow();
    expect(row).toMatchObject({
      authorId: yoni.id,
      communityId: id,
      universalLinkTidal: CONVERTED.links.TIDAL,
      universalLinkDeezer: CONVERTED.links.DEEZER,
      conversionPending: false,
    });
  });

  it('201: saves the post as pending when the converter is unavailable', async () => {
    // Arrange
    const { id, dana } = await community();
    convertLink.mockResolvedValue(UNAVAILABLE);

    // Act
    const response = await post(id, dana);

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.post).toMatchObject({
      conversionPending: true,
      kind: null,
      title: null,
      links: {},
      originalUrl: TRACK,
    });
    const row = await prisma.post.findFirstOrThrow();
    expect(row).toMatchObject({ conversionPending: true, songTitle: null, originalUrl: TRACK });
  });

  it("422: squigly's not_found refuses the link and saves nothing", async () => {
    // Arrange
    const { id, dana } = await community();
    convertLink.mockResolvedValue({ outcome: 'not_found' });

    // Act
    const response = await post(id, dana);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ status: 'error', code: 422, message: INVALID_LINK });
    expect(await prisma.post.count()).toBe(0);
  });

  it.each([
    ['a playlist on a supported host', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'],
    ['http', `http://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`],
    ['an unsupported host', 'https://music.amazon.com/albums/B0H5MWM7RB'],
    ['not a URL', 'bohemian rhapsody'],
  ])('422: refuses %s without converting', async (_why, url) => {
    // Arrange
    const { id, dana } = await community();

    // Act
    const response = await post(id, dana, { url });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(INVALID_LINK);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing url', { comment: 'hi' }],
    ['an unknown key', { url: TRACK, authorId: UNKNOWN_UUID }],
    ['a non-string url', { url: 42 }],
  ])('422: refuses %s', async (_why, body) => {
    // Arrange
    const { id, dana } = await community();

    // Act & Assert
    expect((await post(id, dana, body)).status).toBe(422);
  });

  it('422: refuses a comment over 280 characters', async () => {
    // Arrange
    const { id, dana } = await community();

    // Act
    const response = await post(id, dana, { url: TRACK, comment: 'a'.repeat(281) });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Comments can be up to 280 characters.');
  });

  it('400: unparseable JSON', async () => {
    // Arrange
    const { id, dana } = await community();

    // Act
    const response = await request(app)
      .post(posts(id))
      .set('Cookie', dana.cookie)
      .set('Content-Type', 'application/json')
      .send('{"url":');

    // Assert
    expect(response.status).toBe(400);
  });

  it('401: signed out', async () => {
    // Arrange
    const { id } = await community();

    // Act & Assert
    expect((await request(app).post(posts(id)).send({ url: TRACK })).status).toBe(401);
  });

  it('404: a stranger, an unknown community and a malformed id look the same', async () => {
    // Arrange
    const { id, zed } = await community();

    // Act
    const responses = await Promise.all([
      post(id, zed),
      post(UNKNOWN_UUID, zed),
      post('not-a-uuid', zed),
    ]);

    // Assert
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Community not found.');
    }
    expect(convertLink).not.toHaveBeenCalled();
  });
});

describe('GET /api/communities/:id/posts', () => {
  it('200: newest first, 20 per page, with a cursor that continues without gaps', async () => {
    // Arrange: 23 posts, three of them sharing one timestamp.
    const { id, dana, yoni } = await community();
    const base = Date.parse('2026-10-04T10:00:00.000Z');
    await prisma.post.createMany({
      data: Array.from({ length: 23 }, (_, index) => ({
        authorId: index % 2 === 0 ? dana.id : yoni.id,
        communityId: id,
        originalUrl: TRACK,
        sourceService: 'SPOTIFY' as const,
        songTitle: `Song ${index}`,
        createdAt: new Date(base + Math.min(index, 20) * 1000),
      })),
    });

    // Act
    const first = await request(app).get(posts(id)).set('Cookie', yoni.cookie);
    const second = await request(app)
      .get(posts(id))
      .query({ before: first.body.data.nextCursor as string })
      .set('Cookie', yoni.cookie);

    // Assert
    expect(first.status).toBe(200);
    expect(first.body.data.posts).toHaveLength(20);
    expect(second.body.data.posts).toHaveLength(3);
    expect(second.body.data.nextCursor).toBeNull();
    const titles = [...first.body.data.posts, ...second.body.data.posts].map(
      (item: { title: string }) => item.title,
    );
    expect(new Set(titles).size).toBe(23);
    expect(titles[0]).toMatch(/^Song 2[0-2]$/);
    const mine = first.body.data.posts.filter((item: { isMine: boolean }) => item.isMine);
    expect(mine.every((item: { author: { id: string } }) => item.author.id === yoni.id)).toBe(true);
  });

  it('200: an empty feed', async () => {
    // Arrange
    const { id, dana } = await community();

    // Act
    const response = await request(app).get(posts(id)).set('Cookie', dana.cookie);

    // Assert
    expect(response.body.data).toEqual({ posts: [], nextCursor: null });
  });

  it('401, 404 for a stranger, 422 for a malformed cursor', async () => {
    // Arrange
    const { id, dana, zed } = await community();

    // Act
    const signedOut = await request(app).get(posts(id));
    const stranger = await request(app).get(posts(id)).set('Cookie', zed.cookie);
    const badCursor = await request(app)
      .get(posts(id))
      .query({ before: 'garbage' })
      .set('Cookie', dana.cookie);
    const unknownQuery = await request(app)
      .get(posts(id))
      .query({ limit: '50' })
      .set('Cookie', dana.cookie);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(stranger.status).toBe(404);
    expect(badCursor.status).toBe(422);
    expect(unknownQuery.status).toBe(422);
  });

  it('🔒 sends no user field beyond the author three', async () => {
    // Arrange
    const { id, dana } = await community();
    await post(id, dana);

    // Act
    const response = await request(app).get(posts(id)).set('Cookie', dana.cookie);
    const body = JSON.stringify(response.body);

    // Assert
    expect(Object.keys(response.body.data.posts[0].author).sort()).toEqual([
      'displayName',
      'id',
      'profilePictureUrl',
    ]);
    for (const leak of ['preferredService', 'googleSub', 'communityId', 'authorId', 'updatedAt']) {
      expect(body).not.toContain(leak);
    }
  });
});

describe('POST /api/posts/:postId/conversion', () => {
  async function pendingPost() {
    const setup = await community();
    convertLink.mockResolvedValueOnce(UNAVAILABLE);
    const created = await post(setup.id, setup.dana);
    return { ...setup, postId: created.body.data.post.id as string };
  }

  const retry = (postId: string, who?: Person) => {
    const call = request(app).post(`/api/posts/${postId}/conversion`);
    return who ? call.set('Cookie', who.cookie) : call;
  };

  it('200: the author converts a pending post', async () => {
    // Arrange
    const { postId, dana } = await pendingPost();

    // Act
    const response = await retry(postId, dana);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.post).toMatchObject({
      conversionPending: false,
      title: 'Bohemian Rhapsody',
      links: CONVERTED.links,
    });
  });

  it.each([
    ['unavailable again', UNAVAILABLE],
    ['not found', { outcome: 'not_found' }],
  ])('200: still pending when the converter is %s', async (_why, outcome) => {
    // Arrange
    const { postId, dana } = await pendingPost();
    convertLink.mockResolvedValue(outcome);

    // Act
    const response = await retry(postId, dana);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.post.conversionPending).toBe(true);
  });

  it('409: a post that already has its links', async () => {
    // Arrange
    const { id, dana } = await community();
    const created = await post(id, dana);

    // Act
    const response = await retry(created.body.data.post.id as string, dana);

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('This post already has its links.');
  });

  it('403 for a member who is not the author; 404 for a stranger, unknown and malformed ids; 401 signed out', async () => {
    // Arrange
    const { postId, yoni, zed } = await pendingPost();

    // Act
    const member = await retry(postId, yoni);
    const stranger = await retry(postId, zed);
    const unknown = await retry(UNKNOWN_UUID, yoni);
    const malformed = await retry('nope', yoni);
    const signedOut = await retry(postId);

    // Assert
    expect(member.status).toBe(403);
    expect(member.body.message).toBe('Only the author can do this.');
    for (const response of [stranger, unknown, malformed]) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found.');
    }
    expect(signedOut.status).toBe(401);
  });
});

describe('posts and membership', () => {
  it('leaving keeps your posts in the feed, credited to you; you can no longer retry them', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    convertLink.mockResolvedValueOnce(UNAVAILABLE);
    const created = await post(id, yoni);

    // Act
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    const feed = await request(app).get(posts(id)).set('Cookie', dana.cookie);
    const retried = await request(app)
      .post(`/api/posts/${created.body.data.post.id as string}/conversion`)
      .set('Cookie', yoni.cookie);

    // Assert
    expect(feed.body.data.posts).toHaveLength(1);
    expect(feed.body.data.posts[0].author.displayName).toBe('Yoni');
    expect(retried.status).toBe(404);
  });

  it('removal deletes the removed member’s posts here only, permanently', async () => {
    // Arrange: Yoni posts in Friday Jazz and in a second community.
    const { id, dana, yoni } = await community();
    await post(id, yoni);
    await post(id, dana);
    const other = await request(app)
      .post('/api/communities')
      .set('Cookie', yoni.cookie)
      .send({ name: 'Yoni Solo' });
    const otherId = other.body.data.community.id as string;
    await post(otherId, yoni);

    // Act
    const removed = await request(app)
      .delete(`/api/communities/${id}/members/${yoni.id}`)
      .set('Cookie', dana.cookie);
    await request(app).delete(`/api/communities/${id}/bans/${yoni.id}`).set('Cookie', dana.cookie);

    // Assert
    expect(removed.status).toBe(200);
    const here = await prisma.post.findMany({ where: { communityId: id } });
    expect(here.map((row) => row.authorId)).toEqual([dana.id]);
    expect(await prisma.post.count({ where: { communityId: otherId } })).toBe(1);
  });

  it('deleting the community deletes its posts', async () => {
    // Arrange
    const { id, dana } = await community();
    await post(id, dana);

    // Act
    await request(app).delete(`/api/communities/${id}`).set('Cookie', dana.cookie);

    // Assert
    expect(await prisma.post.count()).toBe(0);
  });
});
