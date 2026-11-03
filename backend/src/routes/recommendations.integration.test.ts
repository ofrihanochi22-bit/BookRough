import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Direct recommendations — docs/features/direct-recommendations.md §7. The
 * converter is mocked: integration tests never launch Chromium (CLAUDE.md §10).
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink,
  CONVERSION_CEILING_MS: 12_000,
}));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const FRIENDS_ONLY = 'You can only send songs to friends.';
const RATE_FRIENDS_ONLY = 'You can only rate songs from friends.';
const INVALID_LINK =
  "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service.";

const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  coverArtUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
  links: { SPOTIFY: TRACK, APPLE_MUSIC: 'https://music.apple.com/us/album/x/1?i=2' },
};
const UNAVAILABLE = { outcome: 'unavailable', reason: 'timeout' };

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string, displayName: string | null = googleSub): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName,
      displayNameKey: displayName?.toLowerCase() ?? null,
      preferredService: displayName === null ? null : 'APPLE_MUSIC',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function befriend(a: Person, b: Person): Promise<void> {
  await prisma.friend.create({
    data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED' },
  });
}

async function unfriend(a: Person, b: Person): Promise<void> {
  await request(app).delete(`/api/friends/${b.id}`).set('Cookie', a.cookie).expect(200);
}

/** Dana and Noam are friends; Zed knows nobody. */
async function trio() {
  const [dana, noam, zed] = await Promise.all([person('dana'), person('noam'), person('zed')]);
  await befriend(dana, noam);
  return { dana, noam, zed };
}

const send = (from: Person, recipientId: string, body: object = { url: TRACK }) =>
  request(app)
    .post('/api/recommendations')
    .set('Cookie', from.cookie)
    .send({ recipientId, ...body });

async function sent(from: Person, to: Person): Promise<string> {
  const response = await send(from, to.id);
  expect(response.status).toBe(201);
  return response.body.data.post.id as string;
}

const get = (who: Person, path: string) => request(app).get(path).set('Cookie', who.cookie);
const received = (who: Person) => get(who, '/api/recommendations/received');
const sentList = (who: Person) => get(who, '/api/recommendations/sent');
const unseen = async (who: Person) =>
  (await get(who, '/api/recommendations/unseen-count')).body.data.count as number;
const seen = (who: Person) =>
  request(app).post('/api/recommendations/seen').set('Cookie', who.cookie);
const hide = (who: Person, postId: string) =>
  request(app).put(`/api/recommendations/${postId}/hidden`).set('Cookie', who.cookie);
const rate = (who: Person, postId: string, score = 8) =>
  request(app).post(`/api/posts/${postId}/ratings`).set('Cookie', who.cookie).send({ score });
const editRating = (who: Person, postId: string) =>
  request(app).patch(`/api/posts/${postId}/rating`).set('Cookie', who.cookie).send({ score: 3 });
const save = (who: Person, postId: string) =>
  request(app).put(`/api/posts/${postId}/bookmark`).set('Cookie', who.cookie);
const destroy = (who: Person, postId: string) =>
  request(app).delete(`/api/posts/${postId}`).set('Cookie', who.cookie);
const retry = (who: Person, postId: string) =>
  request(app).post(`/api/posts/${postId}/conversion`).set('Cookie', who.cookie);

const ids = (response: { body: { data: { posts: Array<{ id: string }> } } }) =>
  response.body.data.posts.map((post) => post.id);

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
  convertLink.mockResolvedValue(CONVERTED);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/recommendations', () => {
  it('sends to a friend: both lists hold it, each with the viewer own view', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    const response = await send(dana, noam.id, { url: TRACK, comment: 'Our trip' });

    // Assert
    expect(response.status).toBe(201);
    const { post } = response.body.data;
    expect(post).toMatchObject({
      title: 'Bohemian Rhapsody',
      comment: 'Our trip',
      isMine: true,
      canDelete: true,
      conversionPending: false,
      direct: {
        recipient: { id: noam.id, displayName: 'noam', profilePictureUrl: null },
        isFriend: true,
      },
    });
    const inbox = (await received(noam)).body.data.posts;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      id: post.id,
      isMine: false,
      canDelete: false,
      links: { APPLE_MUSIC: CONVERTED.links.APPLE_MUSIC },
    });
    expect(ids(await sentList(dana))).toEqual([post.id]);
    expect(ids(await received(dana))).toEqual([]);
    expect(ids(await sentList(noam))).toEqual([]);
  });

  it('works in either direction of the friendship row', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    const response = await send(noam, dana.id);

    // Assert
    expect(response.status).toBe(201);
  });

  it('saves a pending item on a scraper timeout, and the sender can retry it', async () => {
    // Arrange
    const { dana, noam } = await trio();
    convertLink.mockResolvedValueOnce(UNAVAILABLE);

    // Act
    const response = await send(dana, noam.id);
    const retried = await retry(dana, response.body.data.post.id as string);

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.post).toMatchObject({ conversionPending: true, title: null });
    expect(retried.status).toBe(200);
    expect(retried.body.data.post).toMatchObject({
      conversionPending: false,
      direct: { isFriend: true },
    });
  });

  it('allows the same song twice', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    await sent(dana, noam);
    await sent(dana, noam);

    // Assert
    expect(ids(await received(noam))).toHaveLength(2);
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    // Arrange
    const { dana } = await trio();

    // Act
    const response = await request(app)
      .post('/api/recommendations')
      .set('Cookie', dana.cookie)
      .set('Content-Type', 'application/json')
      .send('{ nope');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['no recipient', { url: TRACK }],
    ['a malformed recipient', { recipientId: 'nope', url: TRACK }],
    ['an unknown key', { recipientId: UNKNOWN_UUID, url: TRACK, extra: 1 }],
  ])('returns 422 for %s', async (_label, body) => {
    // Arrange
    const { dana } = await trio();

    // Act
    const response = await request(app)
      .post('/api/recommendations')
      .set('Cookie', dana.cookie)
      .send(body);

    // Assert
    expect(response.status).toBe(422);
  });

  it('returns 422 for a missing URL', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    const response = await send(dana, noam.id, {});

    // Assert
    expect(response.status).toBe(422);
  });

  it('refuses sending to yourself', async () => {
    // Arrange
    const { dana } = await trio();

    // Act
    const response = await send(dana, dana.id);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe("You can't send a song to yourself.");
  });

  it('refuses a playlist link without converting it', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    const response = await send(dana, noam.id, { url: PLAYLIST });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe(INVALID_LINK);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it("refuses a link squigly says it can't find, saving nothing", async () => {
    // Arrange
    const { dana, noam } = await trio();
    convertLink.mockResolvedValueOnce({ outcome: 'not_found' });

    // Act
    const response = await send(dana, noam.id);

    // Assert
    expect(response.status).toBe(422);
    expect(await prisma.post.count()).toBe(0);
  });

  it('refuses a comment over 280 characters', async () => {
    // Arrange
    const { dana, noam } = await trio();

    // Act
    const response = await send(dana, noam.id, { url: TRACK, comment: 'x'.repeat(281) });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Comments can be up to 280 characters.');
  });

  it('returns 401 signed out', async () => {
    // Act
    const response = await request(app)
      .post('/api/recommendations')
      .send({ recipientId: UNKNOWN_UUID, url: TRACK });

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 403 for a sender who has not finished onboarding', async () => {
    // Arrange
    const { noam } = await trio();
    const fresh = await person('fresh', null);

    // Act
    const response = await send(fresh, noam.id);

    // Assert
    expect(response.status).toBe(403);
  });

  it('refuses a stranger without converting', async () => {
    // Arrange
    const { dana, zed } = await trio();

    // Act
    const response = await send(dana, zed.id);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(FRIENDS_ONLY);
    expect(convertLink).not.toHaveBeenCalled();
  });

  it.each(['outgoing', 'incoming'])('refuses an %s pending request', async (direction) => {
    // Arrange
    const { dana, zed } = await trio();
    await prisma.friend.create({
      data:
        direction === 'outgoing'
          ? { requesterId: dana.id, addresseeId: zed.id }
          : { requesterId: zed.id, addresseeId: dana.id },
    });

    // Act
    const response = await send(dana, zed.id);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(FRIENDS_ONLY);
  });

  it('refuses after unfriending, and allows sending again after refriending', async () => {
    // Arrange
    const { dana, noam } = await trio();
    await unfriend(noam, dana);

    // Act
    const refused = await send(dana, noam.id);
    await befriend(noam, dana);
    const allowed = await send(dana, noam.id);

    // Assert
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe(FRIENDS_ONLY);
    expect(allowed.status).toBe(201);
  });

  it('refuses when the friendship ends during the conversion, saving nothing', async () => {
    // Arrange
    const { dana, noam } = await trio();
    convertLink.mockImplementationOnce(async () => {
      await prisma.friend.deleteMany();
      return CONVERTED;
    });

    // Act
    const response = await send(dana, noam.id);

    // Assert
    expect(response.status).toBe(403);
    expect(await prisma.post.count()).toBe(0);
  });

  it.each([
    ['unknown', UNKNOWN_UUID],
    ['mid-onboarding', null],
  ])('returns 404 for a recipient who is %s', async (_label, id) => {
    // Arrange
    const { dana } = await trio();
    const target = id ?? (await person('fresh', null)).id;

    // Act
    const response = await send(dana, target);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('User not found.');
  });
});

describe('the Received and Sent lists', () => {
  it('pages newest first without gaps or duplicates', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const rows = await prisma.post.createManyAndReturn({
      data: Array.from({ length: 21 }, (_, n) => ({
        authorId: dana.id,
        recipientId: noam.id,
        originalUrl: TRACK,
        sourceService: 'SPOTIFY' as const,
        createdAt: new Date(Date.UTC(2026, 10, 1, 10, n)),
      })),
    });

    // Act
    const first = await received(noam);
    const second = await get(
      noam,
      `/api/recommendations/received?before=${first.body.data.nextCursor as string}`,
    );

    // Assert
    expect(ids(first)).toHaveLength(20);
    expect(ids(second)).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();
    const newestFirst = rows.map((row) => row.id).reverse();
    expect([...ids(first), ...ids(second)]).toEqual(newestFirst);
  });

  it.each(['received', 'sent'])('returns 422 for a malformed %s cursor', async (list) => {
    // Arrange
    const { dana } = await trio();

    // Act
    const response = await get(dana, `/api/recommendations/${list}?before=nope`);

    // Assert
    expect(response.status).toBe(422);
  });

  it.each(['received', 'sent', 'unseen-count'])('returns 401 and 403 on %s', async (path) => {
    // Arrange
    const fresh = await person('fresh', null);

    // Act
    const signedOut = await request(app).get(`/api/recommendations/${path}`);
    const onboarding = await get(fresh, `/api/recommendations/${path}`);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(onboarding.status).toBe(403);
  });

  it('🔒 sends only the public keys, and no raw recipient or hidden columns', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);
    await hide(noam, postId);

    // Act
    const [item] = (await sentList(dana)).body.data.posts as Array<Record<string, unknown>>;

    // Assert
    const body = JSON.stringify(item);
    expect(body).not.toContain('recipientId');
    expect(body).not.toContain('Hidden');
    expect(body).not.toContain('SeenAt');
    expect(Object.keys(item!.direct as object).sort()).toEqual(['isFriend', 'recipient']);
    expect(Object.keys((item!.direct as { recipient: object }).recipient).sort()).toEqual([
      'displayName',
      'id',
      'profilePictureUrl',
    ]);
  });
});

describe('the unseen count', () => {
  it('counts what arrived since Received was opened, and ignores hidden items', async () => {
    // Arrange
    const { dana, noam } = await trio();
    await sent(dana, noam);
    await sent(dana, noam);

    // Act & Assert
    expect(await unseen(noam)).toBe(2);
    expect((await seen(noam)).status).toBe(200);
    expect(await unseen(noam)).toBe(0);

    const postId = await sent(dana, noam);
    expect(await unseen(noam)).toBe(1);
    await hide(noam, postId);
    expect(await unseen(noam)).toBe(0);
  });

  it('never counts what you sent yourself', async () => {
    // Arrange
    const { dana, noam } = await trio();
    await sent(dana, noam);

    // Act & Assert
    expect(await unseen(dana)).toBe(0);
  });

  it('POST /seen returns 401 and 403', async () => {
    // Arrange
    const fresh = await person('fresh', null);

    // Act
    const signedOut = await request(app).post('/api/recommendations/seen');
    const onboarding = await seen(fresh);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(onboarding.status).toBe(403);
  });
});

describe('PUT /api/recommendations/:postId/hidden', () => {
  it('takes it out of Received only: the bookmark and rating stay, and the sender sees no change', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);
    await save(noam, postId);
    const other = await sent(dana, noam);
    await rate(noam, other, 3);

    // Act
    const hidden = await hide(noam, postId);
    const again = await hide(noam, postId);
    const hiddenRated = await hide(noam, other);

    // Assert
    expect(hidden.status).toBe(200);
    expect(again.status).toBe(200);
    expect(hiddenRated.status).toBe(200);
    expect(ids(await received(noam))).toEqual([]);
    const myList = await get(noam, '/api/users/me/bookmarks');
    expect(myList.body.data.items.map((item: { post: { id: string } }) => item.post.id)).toEqual([
      postId,
    ]);
    expect((await get(noam, `/api/posts/${postId}`)).status).toBe(200);
    const senderView = await sentList(dana);
    expect(ids(senderView)).toEqual([other, postId]);
    expect(senderView.body.data.posts[0].ratingSummary).toEqual({ average: 3, count: 1 });
  });

  it('is allowed after unfriending', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);
    await unfriend(dana, noam);

    // Act
    const response = await hide(noam, postId);

    // Assert
    expect(response.status).toBe(200);
  });

  it('returns 403 to the sender', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const response = await hide(dana, postId);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Only the recipient can hide this.');
  });

  it('returns 404 to a third party, for an unknown or malformed id, and for a community post', async () => {
    // Arrange
    const { dana, noam, zed } = await trio();
    const postId = await sent(dana, noam);
    const community = await request(app)
      .post('/api/communities')
      .set('Cookie', dana.cookie)
      .send({ name: 'Friday Jazz' });
    const communityPost = await request(app)
      .post(`/api/communities/${community.body.data.community.id as string}/posts`)
      .set('Cookie', dana.cookie)
      .send({ url: TRACK });

    // Act
    const responses = await Promise.all([
      hide(zed, postId),
      hide(dana, UNKNOWN_UUID),
      hide(dana, 'nope'),
      hide(dana, communityPost.body.data.post.id as string),
    ]);

    // Assert
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });

  it('returns 401 and 403', async () => {
    // Arrange
    const fresh = await person('fresh', null);

    // Act
    const signedOut = await request(app).put(`/api/recommendations/${UNKNOWN_UUID}/hidden`);
    const onboarding = await hide(fresh, UNKNOWN_UUID);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(onboarding.status).toBe(403);
  });
});

describe('the existing post endpoints on a direct item', () => {
  it('a third party gets 404 everywhere', async () => {
    // Arrange
    const { dana, noam, zed } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const responses = await Promise.all([
      get(zed, `/api/posts/${postId}`),
      get(zed, `/api/posts/${postId}/ratings`),
      rate(zed, postId),
      editRating(zed, postId),
      save(zed, postId),
      retry(zed, postId),
      destroy(zed, postId),
    ]);

    // Assert
    expect(responses.map((response) => response.status)).toEqual(Array(7).fill(404));
  });

  it('both people open Post Detail, with no community', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const forSender = await get(dana, `/api/posts/${postId}`);
    const forRecipient = await get(noam, `/api/posts/${postId}`);

    // Assert
    expect(forSender.status).toBe(200);
    expect(forSender.body.data.community).toBeNull();
    expect(forSender.body.data.post.canDelete).toBe(true);
    expect(forRecipient.body.data.post).toMatchObject({
      canDelete: false,
      direct: { isFriend: true },
    });
  });

  it('the recipient rates with no bookmark, and the sender sees the score', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const rated = await rate(noam, postId, 8);

    // Assert
    expect(rated.status).toBe(201);
    expect((await sentList(dana)).body.data.posts[0].ratingSummary).toEqual({
      average: 8,
      count: 1,
    });
    const list = await get(dana, `/api/posts/${postId}/ratings`);
    expect(list.body.data.ratings[0]).toMatchObject({ score: 8, isMine: false });
    expect((await received(noam)).body.data.posts[0].myScore).toBe(8);
  });

  it('the sender cannot rate, save, or have a rating to edit', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const rated = await rate(dana, postId);
    const edited = await editRating(dana, postId);
    const saved = await save(dana, postId);

    // Assert
    expect([rated.status, edited.status, saved.status]).toEqual([403, 403, 403]);
    expect(rated.body.message).toBe("You can't rate your own post.");
    expect(saved.body.message).toBe("You can't save your own post.");
  });

  it('a recipient with no rating has nothing to edit', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const response = await editRating(noam, postId);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("You haven't rated this post.");
  });

  it('saving lists it on My List with no community; rating removes it', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);

    // Act
    const saved = await save(noam, postId);
    const list = await get(noam, '/api/users/me/bookmarks');
    await rate(noam, postId);
    const after = await get(noam, '/api/users/me/bookmarks');

    // Assert
    expect(saved.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({
      community: null,
      isMember: false,
      post: { id: postId, direct: { isFriend: true } },
    });
    expect(after.body.data.items).toEqual([]);
    expect((await save(noam, postId)).status).toBe(409);
  });

  it('the recipient cannot retry or delete', async () => {
    // Arrange
    const { dana, noam } = await trio();
    convertLink.mockResolvedValueOnce(UNAVAILABLE);
    const postId = await sent(dana, noam);

    // Act
    const retried = await retry(noam, postId);
    const deleted = await destroy(noam, postId);

    // Assert
    expect(retried.status).toBe(403);
    expect(deleted.status).toBe(403);
    expect(deleted.body.message).toBe('Only the sender can delete this.');
  });

  it('the sender deletes for both, with the rating and bookmark', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const postId = await sent(dana, noam);
    await save(noam, postId);
    await rate(noam, postId);

    // Act
    const response = await destroy(dana, postId);

    // Assert
    expect(response.status).toBe(200);
    expect(ids(await received(noam))).toEqual([]);
    expect(ids(await sentList(dana))).toEqual([]);
    expect((await get(noam, `/api/posts/${postId}`)).status).toBe(404);
    expect(await prisma.rating.count()).toBe(0);
    expect(await prisma.bookmark.count()).toBe(0);
  });
});

describe('after unfriending', () => {
  it('both lists stay; private actions work; rating and editing stop until they refriend', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const rated = await sent(dana, noam);
    const open = await sent(dana, noam);
    await rate(noam, rated);
    await unfriend(dana, noam);

    // Act
    const inbox = await received(noam);
    const outbox = await sentList(dana);
    const saved = await save(noam, open);
    const newRating = await rate(noam, open);
    const edit = await editRating(noam, rated);
    await befriend(dana, noam);
    const afterRefriending = await rate(noam, open);

    // Assert
    expect(ids(inbox)).toEqual([open, rated]);
    expect(ids(outbox)).toEqual([open, rated]);
    expect(inbox.body.data.posts[0].direct.isFriend).toBe(false);
    expect(outbox.body.data.posts[0].direct.isFriend).toBe(false);
    expect(saved.status).toBe(200);
    expect(newRating.status).toBe(403);
    expect(newRating.body.message).toBe(RATE_FRIENDS_ONLY);
    expect(edit.status).toBe(403);
    expect(afterRefriending.status).toBe(201);
  });

  it('the sender can still retry and delete', async () => {
    // Arrange
    const { dana, noam } = await trio();
    convertLink.mockResolvedValueOnce(UNAVAILABLE);
    const postId = await sent(dana, noam);
    await unfriend(noam, dana);

    // Act
    const retried = await retry(dana, postId);
    const deleted = await destroy(dana, postId);

    // Assert
    expect(retried.status).toBe(200);
    expect(deleted.status).toBe(200);
  });
});

describe('a deleted account', () => {
  it.each(['sender', 'recipient'])(
    'deleting the %s row removes the item, rating and bookmark for the other',
    async (who) => {
      // Arrange
      const { dana, noam } = await trio();
      const postId = await sent(dana, noam);
      const saved = await sent(dana, noam);
      await rate(noam, postId);
      await save(noam, saved);

      // Act
      await prisma.user.delete({ where: { id: who === 'sender' ? dana.id : noam.id } });

      // Assert
      expect(await prisma.post.count()).toBe(0);
      expect(await prisma.rating.count()).toBe(0);
      expect(await prisma.bookmark.count()).toBe(0);
    },
  );
});

describe('the database guards', () => {
  const row = (authorId: string) => ({
    authorId,
    originalUrl: TRACK,
    sourceService: 'SPOTIFY' as const,
  });

  it('refuses a post with both targets, with neither, and to its own author', async () => {
    // Arrange
    const { dana, noam } = await trio();
    const community = await prisma.community.create({ data: { name: 'Friday Jazz' } });

    // Act
    const both = prisma.post.create({
      data: { ...row(dana.id), communityId: community.id, recipientId: noam.id },
    });
    const neither = prisma.post.create({ data: row(dana.id) });
    const self = prisma.post.create({ data: { ...row(dana.id), recipientId: dana.id } });

    // Assert
    await expect(both).rejects.toThrow(/posts_one_target/);
    await expect(neither).rejects.toThrow(/posts_one_target/);
    await expect(self).rejects.toThrow(/posts_not_self/);
  });
});

describe('🔒 privacy', () => {
  it('a direct rating never reaches a profile, even for someone sharing a community', async () => {
    // Arrange
    const { dana, noam, zed } = await trio();
    const community = await prisma.community.create({ data: { name: 'Friday Jazz' } });
    await prisma.communityMember.createMany({
      data: [noam, zed].map((member) => ({ userId: member.id, communityId: community.id })),
    });
    await rate(noam, await sent(dana, noam));

    // Act
    const forZed = await get(zed, `/api/users/${noam.id}/ratings`);
    const forDana = await get(dana, `/api/users/${noam.id}/ratings`);

    // Assert
    expect(forZed.body.data.items).toEqual([]);
    expect(forDana.body.data.items).toEqual([]);
  });

  it('no admin response carries a recommendation, a recipient or its comment', async () => {
    // Arrange
    const { dana, noam } = await trio();
    await send(dana, noam.id, { url: TRACK, comment: 'Our secret song' });
    const admin = await prisma.user.create({
      data: {
        googleSub: 'admin',
        displayName: 'Admin',
        displayNameKey: 'admin',
        preferredService: 'SPOTIFY',
        role: 'ADMIN',
      },
    });
    const cookie = `token=${signSessionToken(admin.id)}`;

    // Act
    const users = await request(app).get('/api/admin/users').set('Cookie', cookie);
    const communities = await request(app).get('/api/admin/communities').set('Cookie', cookie);

    // Assert
    expect(users.status).toBe(200);
    expect(communities.status).toBe(200);
    const body = JSON.stringify([users.body, communities.body]);
    expect(body).not.toMatch(/recipient|recommendation|Our secret song|Bohemian/i);
  });
});

describe('regression: communities are unchanged', () => {
  /** Dana owns "Friday Jazz"; Noam is a member. Dana and Noam are also friends. */
  async function shared() {
    const { dana, noam, zed } = await trio();
    const created = await request(app)
      .post('/api/communities')
      .set('Cookie', dana.cookie)
      .send({ name: 'Friday Jazz' });
    const id = created.body.data.community.id as string;
    await prisma.communityMember.create({ data: { userId: noam.id, communityId: id } });
    return { id, dana, noam, zed };
  }

  const post = async (id: string, who: Person) => {
    const response = await request(app)
      .post(`/api/communities/${id}/posts`)
      .set('Cookie', who.cookie)
      .send({ url: TRACK });
    expect(response.status).toBe(201);
    return response.body.data.post as { id: string; direct: unknown };
  };
  const feed = (id: string, who: Person) => get(who, `/api/communities/${id}/posts`);

  it('a community post has `direct: null`, and stays out of both lists', async () => {
    // Arrange
    const { id, dana, noam } = await shared();

    // Act
    const created = await post(id, dana);

    // Assert
    expect(created.direct).toBeNull();
    expect(ids(await received(noam))).toEqual([]);
    expect(ids(await sentList(dana))).toEqual([]);
  });

  it('a direct item never appears in a feed, even when both people are members', async () => {
    // Arrange
    const { id, dana, noam } = await shared();
    await sent(dana, noam);
    const created = await post(id, dana);

    // Act
    const forDana = await feed(id, dana);
    const forNoam = await feed(id, noam);

    // Assert
    expect(ids(forDana)).toEqual([created.id]);
    expect(ids(forNoam)).toEqual([created.id]);
  });

  it('being friends gives no access to a community post', async () => {
    // Arrange
    const { id, dana, zed } = await shared();
    await befriend(dana, zed);
    const created = await post(id, dana);

    // Act
    const detail = await get(zed, `/api/posts/${created.id}`);
    const rated = await rate(zed, created.id);

    // Assert
    expect(detail.status).toBe(404);
    expect(rated.status).toBe(404);
  });

  it('removal deletes community posts and ratings, and leaves direct items and their ratings', async () => {
    // Arrange
    const { id, dana, noam } = await shared();
    const direct = await sent(noam, dana);
    const fromDana = await sent(dana, noam);
    await rate(dana, direct);
    await rate(noam, fromDana);
    const inCommunity = await post(id, noam);
    const danaPost = await post(id, dana);
    await rate(noam, danaPost.id);

    // Act
    const removed = await request(app)
      .delete(`/api/communities/${id}/members/${noam.id}`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(removed.status).toBe(200);
    expect(await prisma.post.findUnique({ where: { id: inCommunity.id } })).toBeNull();
    expect(await prisma.rating.count({ where: { postId: danaPost.id } })).toBe(0);
    expect(await prisma.post.findUnique({ where: { id: direct } })).not.toBeNull();
    expect(await prisma.rating.count({ where: { postId: { in: [direct, fromDana] } } })).toBe(2);
  });

  it('leaving and deleting a community leave direct items alone', async () => {
    // Arrange
    const { id, dana, noam } = await shared();
    const direct = await sent(dana, noam);

    // Act
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', noam.cookie);
    await request(app).delete(`/api/communities/${id}`).set('Cookie', dana.cookie);

    // Assert
    expect(ids(await received(noam))).toEqual([direct]);
  });

  it('My List pages cleanly with both kinds mixed, and a left community stays marked', async () => {
    // Arrange
    const { id, dana, noam } = await shared();
    const direct = await sent(dana, noam);
    const another = await post(id, dana);
    await save(noam, direct);
    await save(noam, another.id);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', noam.cookie);

    // Act
    const list = await get(noam, '/api/users/me/bookmarks');

    // Assert
    expect(list.status).toBe(200);
    const items = list.body.data.items as Array<{
      community: { name: string } | null;
      isMember: boolean;
      post: { id: string };
    }>;
    expect(items.map((item) => item.post.id)).toEqual([another.id, direct]);
    expect(items[0]).toMatchObject({ community: { name: 'Friday Jazz' }, isMember: false });
    expect(items[1]).toMatchObject({ community: null, isMember: false });
  });

  it('unfriending leaves shared communities, posts, ratings and bookmarks untouched', async () => {
    // Arrange
    const { id, dana, noam } = await shared();
    const created = await post(id, dana);
    await rate(noam, created.id);
    const another = await post(id, dana);
    await save(noam, another.id);

    // Act
    await unfriend(dana, noam);

    // Assert
    expect(ids(await feed(id, noam))).toEqual([another.id, created.id]);
    expect((await feed(id, noam)).body.data.posts[1].ratingSummary.count).toBe(1);
    expect((await get(noam, '/api/users/me/bookmarks')).body.data.items).toHaveLength(1);
    expect((await editRating(noam, created.id)).status).toBe(200);
  });

  it('friendship widens nothing on a profile', async () => {
    // Arrange
    const { dana, noam, zed } = await trio();
    const community = await prisma.community.create({ data: { name: 'Private' } });
    await prisma.communityMember.createMany({
      data: [dana, zed].map((member) => ({ userId: member.id, communityId: community.id })),
    });
    const created = await post(community.id, zed);
    await rate(dana, created.id);

    // Act
    const forFriend = await get(noam, `/api/users/${dana.id}/ratings`);

    // Assert
    expect(forFriend.body.data.items).toEqual([]);
  });
});
