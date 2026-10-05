import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Bookmarks and My List — docs/features/bookmarks-my-list.md §7. The converter
 * is mocked (CLAUDE.md §10); posts are mostly inserted directly, since how a
 * post was created does not matter here.
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

async function postBy(author: Person, communityId: string, title = 'Bohemian Rhapsody') {
  const row = await prisma.post.create({
    data: {
      authorId: author.id,
      communityId,
      originalUrl: TRACK,
      sourceService: 'SPOTIFY',
      kind: 'TRACK',
      songTitle: title,
      songArtist: 'Queen',
      universalLinkSpotify: TRACK,
    },
  });
  return row.id;
}

const bookmark = (postId: string) => `/api/posts/${postId}/bookmark`;
const save = (who: Person, postId: string) =>
  request(app).put(bookmark(postId)).set('Cookie', who.cookie);
const unsave = (who: Person, postId: string) =>
  request(app).delete(bookmark(postId)).set('Cookie', who.cookie);
const myList = (who: Person, before?: string) =>
  request(app)
    .get('/api/users/me/bookmarks')
    .query(before ? { before } : {})
    .set('Cookie', who.cookie);

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PUT /api/posts/:postId/bookmark', () => {
  it("200: a member saves someone else's post; saving again keeps one row", async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const postId = await postBy(dana, id);

    // Act
    const first = await save(yoni, postId);
    const second = await save(yoni, postId);

    // Assert
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'success', data: null });
    expect(second.status).toBe(200);
    expect(await prisma.bookmark.count({ where: { userId: yoni.id, postId } })).toBe(1);
  });

  it('the feed shows isBookmarked to the saver only', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const postId = await postBy(dana, id);
    await save(yoni, postId);

    // Act
    const asYoni = await request(app)
      .get(`/api/communities/${id}/posts`)
      .set('Cookie', yoni.cookie);
    const asDana = await request(app)
      .get(`/api/communities/${id}/posts`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(asYoni.body.data.posts[0].isBookmarked).toBe(true);
    expect(asDana.body.data.posts[0].isBookmarked).toBe(false);
  });

  it('403: your own post, and nothing is saved', async () => {
    // Arrange
    const { id, dana } = await community();
    const postId = await postBy(dana, id);

    // Act
    const response = await save(dana, postId);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 'error',
      code: 403,
      message: "You can't save your own post.",
    });
    expect(await prisma.bookmark.count()).toBe(0);
  });

  it('404 for a stranger, unknown, malformed and deleted posts; 401 signed out', async () => {
    // Arrange
    const { id, dana, yoni, zed } = await community();
    const postId = await postBy(dana, id);
    const deletedId = await postBy(dana, id, 'Gone');
    await request(app).delete(`/api/posts/${deletedId}`).set('Cookie', dana.cookie);

    // Act
    const responses = await Promise.all([
      save(zed, postId),
      save(yoni, UNKNOWN_UUID),
      save(yoni, 'not-a-uuid'),
      save(yoni, deletedId),
    ]);
    const signedOut = await request(app).put(bookmark(postId));

    // Assert
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found.');
    }
    expect(signedOut.status).toBe(401);
    expect(await prisma.bookmark.count()).toBe(0);
  });

  it('404 after leaving or being removed: saving needs current membership', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const postId = await postBy(dana, id);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);

    // Act
    const response = await save(yoni, postId);

    // Assert
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/posts/:postId/bookmark', () => {
  it('200: removes the bookmark; again is still 200', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const postId = await postBy(dana, id);
    await save(yoni, postId);

    // Act
    const first = await unsave(yoni, postId);
    const second = await unsave(yoni, postId);

    // Assert
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.bookmark.count()).toBe(0);
  });

  it("200 after leaving the community; it never touches anyone else's bookmark", async () => {
    // Arrange: both Yoni and Ada saved Dana's post.
    const { id, dana, yoni } = await community();
    const ada = await person('sub-ada', 'Ada');
    await prisma.communityMember.create({ data: { userId: ada.id, communityId: id } });
    const postId = await postBy(dana, id);
    await save(yoni, postId);
    await save(ada, postId);
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);

    // Act
    const response = await unsave(yoni, postId);
    const strangers = await unsave(dana, postId);

    // Assert
    expect(response.status).toBe(200);
    expect(strangers.status).toBe(200);
    const left = await prisma.bookmark.findMany();
    expect(left.map((row) => row.userId)).toEqual([ada.id]);
  });

  it('200 for a post that no longer exists; 404 for a malformed id; 401 signed out', async () => {
    // Arrange
    const { yoni } = await community();

    // Act
    const unknown = await unsave(yoni, UNKNOWN_UUID);
    const malformed = await unsave(yoni, 'not-a-uuid');
    const signedOut = await request(app).delete(bookmark(UNKNOWN_UUID));

    // Assert
    expect(unknown.status).toBe(200);
    expect(malformed.status).toBe(404);
    expect(signedOut.status).toBe(401);
  });
});

describe('GET /api/users/me/bookmarks', () => {
  it('200: newest saved first, with the community and isMember', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const older = await postBy(dana, id, 'Older save');
    const newer = await postBy(dana, id, 'Newer save');
    await prisma.bookmark.createMany({
      data: [
        { userId: yoni.id, postId: older, createdAt: new Date('2026-10-05T10:00:00Z') },
        { userId: yoni.id, postId: newer, createdAt: new Date('2026-10-05T11:00:00Z') },
      ],
    });

    // Act
    const response = await myList(yoni);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.nextCursor).toBeNull();
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        savedAt: '2026-10-05T11:00:00.000Z',
        community: { id, name: 'Friday Jazz' },
        isMember: true,
        post: expect.objectContaining({ id: newer, isBookmarked: true, canDelete: false }),
      }),
      expect.objectContaining({ post: expect.objectContaining({ id: older }) }),
    ]);
  });

  it('pages by 20 with a cursor that continues without gaps, ties broken by post id', async () => {
    // Arrange: 25 bookmarks, five of them saved in the same millisecond.
    const { id, dana, yoni } = await community();
    const ids: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      ids.push(await postBy(dana, id, `Song ${index}`));
    }
    await prisma.bookmark.createMany({
      data: ids.map((postId, index) => ({
        userId: yoni.id,
        postId,
        createdAt: new Date(Date.UTC(2026, 9, 5, 10, 0, index < 5 ? 0 : index)),
      })),
    });

    // Act
    const first = await myList(yoni);
    const second = await myList(yoni, first.body.data.nextCursor as string);

    // Assert
    expect(first.body.data.items).toHaveLength(20);
    expect(second.body.data.items).toHaveLength(5);
    expect(second.body.data.nextCursor).toBeNull();
    const seen = [...first.body.data.items, ...second.body.data.items].map(
      (item: { post: { id: string } }) => item.post.id,
    );
    expect(new Set(seen).size).toBe(25);
  });

  it('keeps songs after leaving (isMember false) and after removal; rejoining restores isMember', async () => {
    // Arrange: Yoni saves Dana's post; Ada saves it too and is then removed.
    const { id, dana, yoni } = await community();
    const ada = await person('sub-ada', 'Ada');
    await prisma.communityMember.create({ data: { userId: ada.id, communityId: id } });
    const postId = await postBy(dana, id);
    await save(yoni, postId);
    await save(ada, postId);

    // Act
    await request(app).delete(`/api/communities/${id}/members/me`).set('Cookie', yoni.cookie);
    await request(app)
      .delete(`/api/communities/${id}/members/${ada.id}`)
      .set('Cookie', dana.cookie);
    const afterLeave = await myList(yoni);
    const afterRemoval = await myList(ada);

    // Assert
    expect(afterLeave.body.data.items).toHaveLength(1);
    expect(afterLeave.body.data.items[0].isMember).toBe(false);
    expect(afterRemoval.body.data.items).toHaveLength(1);
    expect(afterRemoval.body.data.items[0].isMember).toBe(false);

    // Act: Yoni rejoins.
    const invite = await request(app)
      .get(`/api/communities/${id}/invite`)
      .set('Cookie', dana.cookie);
    await request(app)
      .post(`/api/invites/${invite.body.data.invite.token as string}/accept`)
      .set('Cookie', yoni.cookie);
    const afterRejoin = await myList(yoni);

    // Assert
    expect(afterRejoin.body.data.items[0].isMember).toBe(true);
  });

  it("removal deletes the removed member's posts, and everyone's bookmarks on them", async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const yonisPost = await postBy(yoni, id);
    await save(dana, yonisPost);

    // Act
    await request(app)
      .delete(`/api/communities/${id}/members/${yoni.id}`)
      .set('Cookie', dana.cookie);
    const response = await myList(dana);

    // Assert
    expect(response.body.data.items).toEqual([]);
  });

  it('a deleted post, and a deleted community, leave the list', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    const deleted = await postBy(dana, id, 'Deleted post');
    const kept = await postBy(dana, id, 'Kept post');
    await save(yoni, deleted);
    await save(yoni, kept);

    // Act
    await request(app).delete(`/api/posts/${deleted}`).set('Cookie', dana.cookie);
    const afterPost = await myList(yoni);
    await request(app).delete(`/api/communities/${id}`).set('Cookie', dana.cookie);
    const afterCommunity = await myList(yoni);

    // Assert
    expect(afterPost.body.data.items.map((item: { post: { id: string } }) => item.post.id)).toEqual(
      [kept],
    );
    expect(afterCommunity.body.data.items).toEqual([]);
  });

  it("200: an empty list, and never another user's bookmarks", async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    await save(yoni, await postBy(dana, id));

    // Act
    const response = await myList(dana);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], nextCursor: null });
  });

  it('401 signed out; 422 for a malformed cursor or an unknown query key', async () => {
    // Arrange
    const { yoni } = await community();

    // Act
    const signedOut = await request(app).get('/api/users/me/bookmarks');
    const badCursor = await myList(yoni, 'not-a-cursor');
    const unknownKey = await request(app)
      .get('/api/users/me/bookmarks')
      .query({ userId: UNKNOWN_UUID })
      .set('Cookie', yoni.cookie);

    // Assert
    expect(signedOut.status).toBe(401);
    expect(badCursor.status).toBe(422);
    expect(unknownKey.status).toBe(422);
  });

  it('🔒 sends no keys beyond SavedPost and PublicPost, and no saver count', async () => {
    // Arrange
    const { id, dana, yoni } = await community();
    await save(yoni, await postBy(dana, id));

    // Act
    const response = await myList(yoni);

    // Assert
    const [item] = response.body.data.items;
    expect(Object.keys(item).sort()).toEqual(['community', 'isMember', 'post', 'savedAt']);
    expect(Object.keys(item.community).sort()).toEqual(['id', 'name']);
    expect(Object.keys(item.post).sort()).toEqual(
      [
        'artist',
        'author',
        'canDelete',
        'comment',
        'conversionPending',
        'coverArtUrl',
        'createdAt',
        'id',
        'isBookmarked',
        'isMine',
        'kind',
        'links',
        'originalUrl',
        'sourceService',
        'title',
      ].sort(),
    );
    expect(Object.keys(item.post.author).sort()).toEqual([
      'displayName',
      'id',
      'profilePictureUrl',
    ]);
  });
});

describe('isBookmarked on other post endpoints', () => {
  it("a new post is not bookmarked; a retry does not show another member's bookmark", async () => {
    // Arrange: Dana's post saves as pending; Yoni bookmarks it.
    const { id, dana, yoni } = await community();
    convertLink.mockResolvedValueOnce({ outcome: 'unavailable', reason: 'timeout' });
    const created = await request(app)
      .post(`/api/communities/${id}/posts`)
      .set('Cookie', dana.cookie)
      .send({ url: TRACK });
    const postId = created.body.data.post.id as string;
    await save(yoni, postId);
    convertLink.mockResolvedValueOnce({
      outcome: 'converted',
      kind: 'TRACK',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      coverArtUrl: null,
      links: { SPOTIFY: TRACK },
    });

    // Act
    const retried = await request(app)
      .post(`/api/posts/${postId}/conversion`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(created.body.data.post.isBookmarked).toBe(false);
    expect(retried.status).toBe(200);
    expect(retried.body.data.post.isBookmarked).toBe(false);
  });
});
