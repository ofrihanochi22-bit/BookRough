import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Discussion threads — docs/features/discussion-threads.md §7 (UC-22). The
 * converter is mocked (CLAUDE.md §10); posts and ratings are inserted directly.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink,
  CONVERSION_CEILING_MS: 12_000,
}));

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

function trackPost(authorId: string, target: { communityId: string } | { recipientId: string }) {
  return prisma.post.create({
    data: {
      authorId,
      ...target,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: 'Blue',
      songArtist: 'Joni Mitchell',
      universalLinkSpotify: TRACK,
    },
  });
}

/** Dana owns "Friday Jazz" and posted "Blue"; Yoni and Ada are members, Zed a stranger. */
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
  const post = await trackPost(dana.id, { communityId: id });
  return { id, postId: post.id, dana, yoni, ada, zed };
}

const list = (who: Person, postId: string) =>
  request(app).get(`/api/posts/${postId}/comments`).set('Cookie', who.cookie);
const add = (who: Person, postId: string, body: object) =>
  request(app).post(`/api/posts/${postId}/comments`).set('Cookie', who.cookie).send(body);
const edit = (who: Person, commentId: string, body: object) =>
  request(app).patch(`/api/comments/${commentId}`).set('Cookie', who.cookie).send(body);
const remove = (who: Person, commentId: string) =>
  request(app).delete(`/api/comments/${commentId}`).set('Cookie', who.cookie);
const notifications = async (who: Person) => {
  const response = await request(app).get('/api/notifications').set('Cookie', who.cookie);
  return response.body.data.items as Array<{ type: string; count: number; actor: { id: string } }>;
};

async function commentId(who: Person, postId: string, body: object): Promise<string> {
  const response = await add(who, postId, body);
  expect(response.status).toBe(201);
  return response.body.data.comment.id as string;
}

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/posts/:postId/comments', () => {
  it('adds a post comment, tells the post author, and counts it on the post', async () => {
    // Arrange
    const { postId, dana, yoni } = await community();

    // Act
    const response = await add(yoni, postId, { body: '  Love this one  ' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.comment).toEqual({
      id: expect.any(String) as string,
      author: { id: yoni.id, displayName: 'Yoni', profilePictureUrl: null },
      body: 'Love this one',
      deleted: false,
      createdAt: expect.any(String) as string,
      editedAt: null,
      ratingId: null,
      parentId: null,
      replyTo: null,
      isMine: true,
      canDelete: true,
    });
    expect(await notifications(dana)).toMatchObject([
      { type: 'COMMENT_REPLY', count: 1, actor: { id: yoni.id } },
    ]);
    const post = await request(app).get(`/api/posts/${postId}`).set('Cookie', dana.cookie);
    expect(post.body.data.post.commentCount).toBe(1);
  });

  it('replies under a review, and groups unread replies to one reader', async () => {
    // Arrange
    const { postId, yoni, ada, dana } = await community();
    const rating = await prisma.rating.create({
      data: { postId, userId: yoni.id, score: 9, comment: 'A classic' },
    });

    // Act
    const first = await add(ada, postId, { body: 'Agreed', ratingId: rating.id });
    await add(dana, postId, { body: 'Same', ratingId: rating.id });

    // Assert
    expect(first.status).toBe(201);
    expect(first.body.data.comment).toMatchObject({
      ratingId: rating.id,
      replyTo: { id: yoni.id, displayName: 'Yoni' },
    });
    expect(await notifications(yoni)).toMatchObject([
      { type: 'COMMENT_REPLY', count: 2, actor: { id: dana.id } },
    ]);
  });

  it('replies to someone already in a comment thread, who alone is told', async () => {
    // Arrange
    const { postId, dana, yoni, ada } = await community();
    const parentId = await commentId(yoni, postId, { body: 'Who sings this?' });
    await commentId(ada, postId, { body: 'Joni', parentId });

    // Act
    const response = await add(dana, postId, { body: 'Thanks Ada', parentId, replyToId: ada.id });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.comment.replyTo).toMatchObject({ id: ada.id });
    expect(await notifications(ada)).toMatchObject([
      { type: 'COMMENT_REPLY', count: 1, actor: { id: dana.id } },
    ]);
  });

  it('answers the opener when the named person is outside the thread', async () => {
    // Arrange
    const { postId, yoni, ada, zed } = await community();
    const parentId = await commentId(yoni, postId, { body: 'Who sings this?' });

    // Act
    const response = await add(ada, postId, { body: 'Joni', parentId, replyToId: zed.id });

    // Assert
    expect(response.body.data.comment.replyTo).toMatchObject({ id: yoni.id });
  });

  it('is a 404 under a review-less rating, a reply, or a deleted or foreign parent', async () => {
    // Arrange
    const { id, postId, dana, yoni, ada } = await community();
    const bare = await prisma.rating.create({ data: { postId, userId: yoni.id, score: 5 } });
    const parentId = await commentId(yoni, postId, { body: 'Opener' });
    const replyId = await commentId(ada, postId, { body: 'Reply', parentId });
    const other = await trackPost(dana.id, { communityId: id });
    const foreignId = await commentId(yoni, other.id, { body: 'Elsewhere' });

    // Act
    const responses = await Promise.all([
      add(ada, postId, { body: 'Hi', ratingId: bare.id }),
      add(ada, postId, { body: 'Hi', parentId: replyId }),
      add(ada, postId, { body: 'Hi', parentId: foreignId }),
      add(ada, postId, { body: 'Hi', parentId: UNKNOWN_UUID }),
    ]);

    // Assert
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('That comment is gone.');
    }
  });

  it('is a 422 for an empty, too long, malformed or two-thread payload', async () => {
    // Arrange
    const { postId, yoni } = await community();

    // Act
    const responses = await Promise.all([
      add(yoni, postId, { body: '   ' }),
      add(yoni, postId, { body: 'a'.repeat(501) }),
      add(yoni, postId, { body: 'Hi', extra: true }),
      add(yoni, postId, { body: 'Hi', parentId: 'not-a-uuid' }),
      add(yoni, postId, { body: 'Hi', ratingId: UNKNOWN_UUID, parentId: UNKNOWN_UUID }),
    ]);

    // Assert
    expect(responses.map((response) => response.status)).toEqual([422, 422, 422, 422, 422]);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('is a 401 without a session', async () => {
    // Arrange
    const { postId } = await community();

    // Act
    const response = await request(app).post(`/api/posts/${postId}/comments`).send({ body: 'Hi' });

    // Assert
    expect(response.status).toBe(401);
  });

  it('is a 404 for a stranger and an unknown post', async () => {
    // Arrange
    const { postId, zed } = await community();

    // Act
    const stranger = await add(zed, postId, { body: 'Hi' });
    const unknown = await add(zed, UNKNOWN_UUID, { body: 'Hi' });

    // Assert
    expect(stranger.status).toBe(404);
    expect(unknown.status).toBe(404);
  });

  it('is a 403 on a direct recommendation once no longer friends, though it can still be read', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([
      person('sub-dana', 'Dana'),
      person('sub-noam', 'Noam'),
    ]);
    const post = await trackPost(dana.id, { recipientId: noam.id });

    // Act
    const write = await add(noam, post.id, { body: 'Thanks!' });
    const read = await list(noam, post.id);

    // Assert
    expect(write.status).toBe(403);
    expect(write.body.message).toBe('You can only comment on songs from friends.');
    expect(read.status).toBe(200);
  });

  it('lets friends talk on a direct recommendation', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([
      person('sub-dana', 'Dana'),
      person('sub-noam', 'Noam'),
    ]);
    await prisma.friend.create({
      data: { requesterId: dana.id, addresseeId: noam.id, status: 'ACCEPTED' },
    });
    const post = await trackPost(dana.id, { recipientId: noam.id });

    // Act
    const response = await add(noam, post.id, { body: 'Thanks!' });

    // Assert
    expect(response.status).toBe(201);
    expect(await notifications(dana)).toMatchObject([{ type: 'COMMENT_REPLY' }]);
  });
});

describe('GET /api/posts/:postId/comments', () => {
  it('lists the discussion oldest first, with delete rights for an admin', async () => {
    // Arrange
    const { postId, dana, yoni, ada } = await community();
    await commentId(yoni, postId, { body: 'First' });
    await commentId(ada, postId, { body: 'Second' });

    // Act
    const owner = await list(dana, postId);
    const member = await list(ada, postId);

    // Assert
    expect(owner.status).toBe(200);
    expect(owner.body.data.comments.map((c: { body: string }) => c.body)).toEqual([
      'First',
      'Second',
    ]);
    expect(owner.body.data.comments.every((c: { canDelete: boolean }) => c.canDelete)).toBe(true);
    expect(member.body.data.comments.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([
      false,
      true,
    ]);
  });

  it('is a 404 for a stranger and a 401 without a session', async () => {
    // Arrange
    const { postId, zed } = await community();

    // Act
    const stranger = await list(zed, postId);
    const anonymous = await request(app).get(`/api/posts/${postId}/comments`);

    // Assert
    expect(stranger.status).toBe(404);
    expect(anonymous.status).toBe(401);
  });
});

describe('PATCH /api/comments/:commentId', () => {
  it('edits your own comment and marks it edited', async () => {
    // Arrange
    const { postId, yoni } = await community();
    const id = await commentId(yoni, postId, { body: 'Good' });

    // Act
    const response = await edit(yoni, id, { body: 'Great' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.comment).toMatchObject({
      body: 'Great',
      editedAt: expect.any(String),
    });
  });

  it("is a 403 on someone else's comment, even for the owner", async () => {
    // Arrange
    const { postId, dana, yoni } = await community();
    const id = await commentId(yoni, postId, { body: 'Good' });

    // Act
    const response = await edit(dana, id, { body: 'Changed' });

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Only the author can do this.');
  });

  it('is a 404 for a stranger, an unknown id and a malformed id; a 422 for an empty body', async () => {
    // Arrange
    const { postId, yoni, zed } = await community();
    const id = await commentId(yoni, postId, { body: 'Good' });

    // Act
    const stranger = await edit(zed, id, { body: 'Hi' });
    const unknown = await edit(yoni, UNKNOWN_UUID, { body: 'Hi' });
    const malformed = await edit(yoni, 'nope', { body: 'Hi' });
    const empty = await edit(yoni, id, { body: '' });

    // Assert
    expect([stranger.status, unknown.status, malformed.status, empty.status]).toEqual([
      404, 404, 404, 422,
    ]);
  });
});

describe('DELETE /api/comments/:commentId', () => {
  it('hides a post comment with replies, then removes it with its last reply', async () => {
    // Arrange
    const { postId, yoni, ada } = await community();
    const parentId = await commentId(yoni, postId, { body: 'Opener' });
    const replyId = await commentId(ada, postId, { body: 'Reply', parentId });

    // Act
    const hidden = await remove(yoni, parentId);
    const shown = await list(ada, postId);
    const removed = await remove(ada, replyId);

    // Assert
    expect(hidden.body.data).toEqual({ deleted: 'hidden' });
    expect(shown.body.data.comments[0]).toMatchObject({ body: null, deleted: true });
    expect(removed.body.data).toEqual({ deleted: 'removed' });
    expect(await prisma.comment.count()).toBe(0);
  });

  it("lets a community admin remove a member's comment", async () => {
    // Arrange
    const { postId, dana, yoni } = await community();
    const id = await commentId(yoni, postId, { body: 'Spam' });

    // Act
    const response = await remove(dana, id);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 'removed' });
  });

  it("is a 403 for a member on someone else's comment, a 404 the second time", async () => {
    // Arrange
    const { postId, yoni, ada } = await community();
    const id = await commentId(yoni, postId, { body: 'Mine' });

    // Act
    const forbidden = await remove(ada, id);
    await remove(yoni, id);
    const again = await remove(yoni, id);

    // Assert
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toBe('Only the author or an admin can delete this.');
    expect(again.status).toBe(404);
  });

  it('is a 401 without a session', async () => {
    // Act
    const response = await request(app).delete(`/api/comments/${UNKNOWN_UUID}`);

    // Assert
    expect(response.status).toBe(401);
  });
});

describe('the comments table', () => {
  it('drops review replies with the rating, and everything with the post', async () => {
    // Arrange
    const { postId, yoni, ada } = await community();
    const rating = await prisma.rating.create({
      data: { postId, userId: yoni.id, score: 9, comment: 'A classic' },
    });
    await commentId(ada, postId, { body: 'Agreed', ratingId: rating.id });
    await commentId(ada, postId, { body: 'On the post' });

    // Act
    await prisma.rating.delete({ where: { id: rating.id } });
    const afterRating = await prisma.comment.count();
    await prisma.post.delete({ where: { id: postId } });

    // Assert
    expect(afterRating).toBe(1);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('refuses a reply in two threads and a body-less live comment', async () => {
    // Arrange
    const { postId, yoni } = await community();
    const rating = await prisma.rating.create({
      data: { postId, userId: yoni.id, score: 9, comment: 'A classic' },
    });
    const parentId = await commentId(yoni, postId, { body: 'Opener' });

    // Act + Assert
    await expect(
      prisma.comment.create({
        data: { postId, authorId: yoni.id, body: 'x', ratingId: rating.id, parentId },
      }),
    ).rejects.toThrow(/comments_one_thread/);
    await expect(
      prisma.comment.create({ data: { postId, authorId: yoni.id, body: null } }),
    ).rejects.toThrow(/comments_body_or_deleted/);
  });
});
