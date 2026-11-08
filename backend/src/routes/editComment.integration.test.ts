import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * PATCH /api/posts/:postId/comment — docs/features/edit-post-comment.md §7.
 * The converter is mocked (CLAUDE.md §10).
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink,
  CONVERSION_CEILING_MS: 12_000,
}));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const CONVERTED = {
  outcome: 'converted',
  kind: 'TRACK',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  coverArtUrl: null,
  links: { SPOTIFY: TRACK },
};

interface Person {
  id: string;
  cookie: string;
}

async function person(name: string): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub: name,
      displayName: name,
      displayNameKey: name.toLowerCase(),
      preferredService: 'SPOTIFY',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function community(owner: Person, admins: Person[], members: Person[]): Promise<string> {
  const created = await prisma.community.create({ data: { name: 'Friday Jazz' } });
  await prisma.communityMember.createMany({
    data: [
      { userId: owner.id, communityId: created.id, role: 'OWNER' as const },
      ...admins.map((admin) => ({
        userId: admin.id,
        communityId: created.id,
        role: 'ADMIN' as const,
      })),
      ...members.map((member) => ({
        userId: member.id,
        communityId: created.id,
        role: 'MEMBER' as const,
      })),
    ],
  });
  return created.id;
}

const edit = (who: Person | null, postId: string, body: unknown) => {
  const call = request(app)
    .patch(`/api/posts/${postId}/comment`)
    .send(body as object);
  return who ? call.set('Cookie', who.cookie) : call;
};

async function postIn(who: Person, communityId: string, comment = 'First take'): Promise<string> {
  const response = await request(app)
    .post(`/api/communities/${communityId}/posts`)
    .set('Cookie', who.cookie)
    .send({ url: TRACK, comment });
  expect(response.status).toBe(201);
  return response.body.data.post.id as string;
}

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
  convertLink.mockResolvedValue(CONVERTED);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PATCH /api/posts/:postId/comment', () => {
  it('lets the author change it; the feed shows the new comment, marked edited', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, [], [noam]);
    const postId = await postIn(dana, jazz);

    // Act
    const response = await edit(dana, postId, { comment: '  Second take  ' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.post).toMatchObject({ id: postId, comment: 'Second take' });
    expect(response.body.data.post.commentEditedAt).toEqual(expect.any(String));
    const feed = await request(app)
      .get(`/api/communities/${jazz}/posts`)
      .set('Cookie', noam.cookie);
    expect(feed.body.data.posts[0]).toMatchObject({ comment: 'Second take' });
    expect(feed.body.data.posts[0].commentEditedAt).not.toBeNull();
  });

  it('clears to null, and an unchanged save leaves the post unmarked', async () => {
    // Arrange
    const dana = await person('Dana');
    const jazz = await community(dana, [], []);
    const first = await postIn(dana, jazz);
    const second = await postIn(dana, jazz, 'Keep me');

    // Act
    const cleared = await edit(dana, first, { comment: null });
    const unchanged = await edit(dana, second, { comment: 'Keep me ' });

    // Assert
    expect(cleared.body.data.post).toMatchObject({ comment: null });
    expect(cleared.body.data.post.commentEditedAt).not.toBeNull();
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data.post).toMatchObject({ comment: 'Keep me', commentEditedAt: null });
  });

  it('lets the sender edit a direct item while friends, and refuses after unfriending', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    await prisma.friend.create({
      data: { requesterId: dana.id, addresseeId: noam.id, status: 'ACCEPTED' },
    });
    const sent = await request(app)
      .post('/api/recommendations')
      .set('Cookie', dana.cookie)
      .send({ recipientId: noam.id, url: TRACK, comment: 'For you' });
    const postId = sent.body.data.post.id as string;

    // Act
    const asFriend = await edit(dana, postId, { comment: 'Really, for you' });
    const asRecipient = await edit(noam, postId, { comment: 'Not mine' });
    await request(app).delete(`/api/friends/${noam.id}`).set('Cookie', dana.cookie).expect(200);
    const afterUnfriending = await edit(dana, postId, { comment: 'Too late' });

    // Assert
    expect(asFriend.status).toBe(200);
    const received = await request(app)
      .get('/api/recommendations/received')
      .set('Cookie', noam.cookie);
    expect(received.body.data.posts[0]).toMatchObject({ comment: 'Really, for you' });
    expect(asRecipient.status).toBe(403);
    expect(afterUnfriending.status).toBe(403);
    expect(afterUnfriending.body.message).toBe('You can only edit songs you sent to friends.');
  });

  it('is a 403 for another member and for the community admin', async () => {
    // Arrange
    const [dana, ada, noam] = await Promise.all([person('Dana'), person('Ada'), person('Noam')]);
    const jazz = await community(ada, [], [dana, noam]);
    const postId = await postIn(dana, jazz);

    // Act
    const asMember = await edit(noam, postId, { comment: 'Hijack' });
    const asOwner = await edit(ada, postId, { comment: 'Moderated' });

    // Assert
    for (const response of [asMember, asOwner]) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        status: 'error',
        code: 403,
        message: 'Only the author can do this.',
      });
    }
  });

  it('is a 404 for an unknown or malformed id, a non-member, and an author who left', async () => {
    // Arrange
    const [dana, zed, noam] = await Promise.all([person('Dana'), person('Zed'), person('Noam')]);
    const jazz = await community(noam, [], [dana]);
    const postId = await postIn(dana, jazz);

    // Act
    const unknown = await edit(dana, UNKNOWN_UUID, { comment: 'x' });
    const malformed = await edit(dana, 'not-a-uuid', { comment: 'x' });
    const outsider = await edit(zed, postId, { comment: 'x' });
    await request(app)
      .delete(`/api/communities/${jazz}/members/me`)
      .set('Cookie', dana.cookie)
      .expect(200);
    const leftAuthor = await edit(dana, postId, { comment: 'x' });

    // Assert
    for (const response of [unknown, malformed, outsider, leftAuthor]) {
      expect(response.status).toBe(404);
    }
  });

  it('is a 422 for a too-long comment, an unknown key or a wrong type', async () => {
    // Arrange
    const dana = await person('Dana');
    const jazz = await community(dana, [], []);
    const postId = await postIn(dana, jazz);

    // Act
    const tooLong = await edit(dana, postId, { comment: 'x'.repeat(281) });
    const extraKey = await edit(dana, postId, { comment: 'ok', url: TRACK });
    const wrongType = await edit(dana, postId, { comment: 5 });

    // Assert
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.message).toBe('Comments can be up to 280 characters.');
    expect(extraKey.status).toBe(422);
    expect(wrongType.status).toBe(422);
  });

  it('is a 401 without a session', async () => {
    // Act & Assert
    await edit(null, UNKNOWN_UUID, { comment: 'x' }).expect(401);
  });
});
