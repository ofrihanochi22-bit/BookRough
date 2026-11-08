import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * The notification center — docs/features/notifications.md §7 (UC-21). Every
 * event goes through the real API, so the writers, the grouping upsert on the
 * hand-written partial index, the visibility joins and the cascades all run
 * against Postgres. The converter is mocked (CLAUDE.md §10).
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink,
  CONVERSION_CEILING_MS: 12_000,
}));

const app = createApp();

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const NOT_FOUND = 'Notification not found.';
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

interface Item {
  id: string;
  type: string;
  read: boolean;
  actor: { id: string; displayName: string };
  community: { id: string; name: string } | null;
  post: { id: string; title: string | null } | null;
  count: number;
  score: number | null;
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

/** A community the owner runs, with the others as members. */
async function community(owner: Person, ...members: Person[]): Promise<string> {
  const created = await prisma.community.create({ data: { name: 'Friday Jazz' } });
  await prisma.communityMember.createMany({
    data: [
      { userId: owner.id, communityId: created.id, role: 'OWNER' },
      ...members.map((member) => ({
        userId: member.id,
        communityId: created.id,
        role: 'MEMBER' as const,
      })),
    ],
  });
  return created.id;
}

const as = (who: Person) => ({
  get: (path: string) => request(app).get(path).set('Cookie', who.cookie),
  post: (path: string, body?: object) =>
    request(app)
      .post(path)
      .set('Cookie', who.cookie)
      .send(body ?? {}),
  delete: (path: string) => request(app).delete(path).set('Cookie', who.cookie),
});

async function postIn(who: Person, communityId: string): Promise<string> {
  const response = await as(who).post(`/api/communities/${communityId}/posts`, { url: TRACK });
  expect(response.status).toBe(201);
  return response.body.data.post.id as string;
}

async function items(who: Person): Promise<Item[]> {
  const response = await as(who).get('/api/notifications');
  expect(response.status).toBe(200);
  return response.body.data.items as Item[];
}

async function unread(who: Person): Promise<number> {
  const response = await as(who).get('/api/notifications/unread-count');
  expect(response.status).toBe(200);
  return response.body.data.count as number;
}

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
  convertLink.mockResolvedValue(CONVERTED);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the five events, through the API', () => {
  it('community posts group per community while unread, never for the author', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);

    // Act
    await postIn(dana, jazz);
    await postIn(dana, jazz);
    await postIn(noam, jazz);

    // Assert
    const [group] = await items(noam);
    expect(await items(noam)).toHaveLength(1);
    expect(group).toMatchObject({
      type: 'COMMUNITY_POSTS',
      count: 2,
      read: false,
      actor: { id: dana.id, displayName: 'Dana' },
      community: { id: jazz, name: 'Friday Jazz' },
    });
    expect(await items(dana)).toMatchObject([{ type: 'COMMUNITY_POSTS', count: 1 }]);
  });

  it('a read group closes: the next post starts a new one', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await postIn(dana, jazz);
    const [first] = await items(noam);
    await as(noam).post(`/api/notifications/${first!.id}/read`).expect(200);

    // Act
    await postIn(dana, jazz);

    // Assert
    const list = await items(noam);
    expect(list.map((item) => [item.count, item.read])).toEqual([
      [1, false],
      [1, true],
    ]);
  });

  it('a rating tells the author, with the current score, and an edit adds nothing', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    const postId = await postIn(dana, jazz);

    // Act
    await as(noam).post(`/api/posts/${postId}/ratings`, { score: 8 }).expect(201);
    await request(app)
      .patch(`/api/posts/${postId}/rating`)
      .set('Cookie', noam.cookie)
      .send({ score: 6 })
      .expect(200);

    // Assert
    expect(await items(dana)).toMatchObject([
      {
        type: 'RATING',
        actor: { id: noam.id },
        post: { id: postId, title: 'Bohemian Rhapsody' },
        score: 6,
      },
    ]);
  });

  it('a direct recommendation tells the recipient', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    await prisma.friend.create({
      data: { requesterId: dana.id, addresseeId: noam.id, status: 'ACCEPTED' },
    });

    // Act
    const response = await as(dana).post('/api/recommendations', {
      recipientId: noam.id,
      url: TRACK,
    });

    // Assert
    expect(response.status).toBe(201);
    expect(await items(noam)).toMatchObject([
      { type: 'RECOMMENDATION', actor: { id: dana.id }, post: { id: response.body.data.post.id } },
    ]);
  });

  it('a friend request tells the addressee once, and an accept tells the requester', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);

    // Act: send, withdraw, send again — then Noam accepts.
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);
    await as(dana).delete(`/api/friends/requests/sent/${noam.id}`).expect(200);
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);
    await as(noam).post(`/api/friends/requests/${dana.id}/accept`).expect(200);

    // Assert
    expect(await items(noam)).toMatchObject([{ type: 'FRIEND_REQUEST', actor: { id: dana.id } }]);
    expect(await items(dana)).toMatchObject([{ type: 'FRIEND_ACCEPTED', actor: { id: noam.id } }]);
  });

  it('an invitation tells the invited friend', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    await prisma.friend.create({
      data: { requesterId: dana.id, addresseeId: noam.id, status: 'ACCEPTED' },
    });
    const jazz = await community(dana);

    // Act
    await as(dana).post(`/api/communities/${jazz}/invitations`, { userIds: [noam.id] });

    // Assert
    expect(await items(noam)).toMatchObject([
      { type: 'COMMUNITY_INVITATION', actor: { id: dana.id }, community: { id: jazz } },
    ]);
  });
});

describe('GET /api/notifications', () => {
  it('pages newest activity first with a cursor', async () => {
    // Arrange: 21 requests from 21 people.
    const me = await person('Me');
    const senders = await Promise.all(
      Array.from({ length: 21 }, (_, index) => person(`Sender${index}`)),
    );
    for (const [index, sender] of senders.entries()) {
      await prisma.notification.create({
        data: {
          userId: me.id,
          type: 'FRIEND_REQUEST',
          actorId: sender.id,
          updatedAt: new Date(Date.UTC(2026, 10, 1, 0, index)),
        },
      });
    }

    // Act
    const first = await as(me).get('/api/notifications');
    const second = await as(me)
      .get('/api/notifications')
      .query({ before: first.body.data.nextCursor as string });

    // Assert
    expect(first.body.data.items).toHaveLength(20);
    expect(first.body.data.items[0].actor.id).toBe(senders[20]!.id);
    expect(second.body.data.items.map((item: Item) => item.actor.id)).toEqual([senders[0]!.id]);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('is a 422 for a malformed cursor and a 401 without a session', async () => {
    // Arrange
    const me = await person('Me');

    // Act & Assert
    await as(me).get('/api/notifications').query({ before: 'nope' }).expect(422);
    await request(app).get('/api/notifications').expect(401);
  });

  it('hides a community’s posts once the reader is removed, in the list and the count', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await postIn(dana, jazz);
    expect(await unread(noam)).toBe(1);

    // Act
    await as(dana).delete(`/api/communities/${jazz}/members/${noam.id}`).expect(200);

    // Assert
    expect(await items(noam)).toEqual([]);
    expect(await unread(noam)).toBe(0);
  });

  it('drops a rating notification with its post (cascade)', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    const postId = await postIn(dana, jazz);
    await as(noam).post(`/api/posts/${postId}/ratings`, { score: 9 }).expect(201);

    // Act
    await as(dana).delete(`/api/posts/${postId}`).expect(200);

    // Assert
    expect(await items(dana)).toEqual([]);
  });
});

describe('GET /api/notifications/unread-count', () => {
  it('counts unread rows, a group once', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await postIn(dana, jazz);
    await postIn(dana, jazz);
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);

    // Act & Assert
    expect(await unread(noam)).toBe(2);
  });

  it('is a 401 without a session', async () => {
    // Act & Assert
    await request(app).get('/api/notifications/unread-count').expect(401);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('marks one read and returns it; the count drops; a repeat is idempotent', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);
    const [item] = await items(noam);

    // Act
    const response = await as(noam).post(`/api/notifications/${item!.id}/read`);
    const again = await as(noam).post(`/api/notifications/${item!.id}/read`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.notification).toMatchObject({ id: item!.id, read: true });
    expect(again.status).toBe(200);
    expect(await unread(noam)).toBe(0);
  });

  it('is a 404 for someone else’s, an unknown or a malformed id, and leaves theirs unread', async () => {
    // Arrange
    const [dana, noam, zed] = await Promise.all([person('Dana'), person('Noam'), person('Zed')]);
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);
    const [item] = await items(noam);

    // Act
    const theirs = await as(zed).post(`/api/notifications/${item!.id}/read`);
    const unknown = await as(zed).post(`/api/notifications/${UNKNOWN_UUID}/read`);
    const malformed = await as(zed).post('/api/notifications/not-a-uuid/read');

    // Assert
    for (const response of [theirs, unknown, malformed]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ status: 'error', code: 404, message: NOT_FOUND });
    }
    expect(await unread(noam)).toBe(1);
  });

  it('is a 404 for a row the reader can no longer see, which stays unread', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await postIn(dana, jazz);
    const [item] = await items(noam);
    await as(dana).delete(`/api/communities/${jazz}/members/${noam.id}`).expect(200);

    // Act
    const response = await as(noam).post(`/api/notifications/${item!.id}/read`);

    // Assert
    expect(response.status).toBe(404);
    const stored = await prisma.notification.findUnique({ where: { id: item!.id } });
    expect(stored?.readAt).toBeNull();
  });

  it('is a 401 without a session', async () => {
    // Act & Assert
    await request(app).post(`/api/notifications/${UNKNOWN_UUID}/read`).expect(401);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('reads every unread row of the caller only', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await postIn(dana, jazz);
    await postIn(noam, jazz);
    await as(dana).post('/api/friends/requests', { userId: noam.id }).expect(200);

    // Act
    const response = await as(noam).post('/api/notifications/read-all');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 0 });
    expect(await unread(noam)).toBe(0);
    expect(await unread(dana)).toBe(1);
  });

  it('is a 401 without a session', async () => {
    // Act & Assert
    await request(app).post('/api/notifications/read-all').expect(401);
  });
});

/** Role notifications — docs/features/role-notifications.md §7. */
describe('role notifications', () => {
  const setRole = (who: Person, communityId: string, userId: string, role: string) =>
    request(app)
      .patch(`/api/communities/${communityId}/members/${userId}`)
      .set('Cookie', who.cookie)
      .send({ role });

  it('tells a member they were made an admin, and the count goes up', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);

    // Act
    await setRole(dana, jazz, noam.id, 'ADMIN').expect(200);

    // Assert
    expect(await items(noam)).toMatchObject([
      { type: 'COMMUNITY_ADMIN', actor: { id: dana.id }, community: { id: jazz } },
    ]);
    expect(await unread(noam)).toBe(1);
  });

  it('keeps a demotion silent, and a demote then re-promote leaves one unread row', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await setRole(dana, jazz, noam.id, 'ADMIN').expect(200);

    // Act
    await setRole(dana, jazz, noam.id, 'MEMBER').expect(200);
    const afterDemotion = await items(noam);
    await setRole(dana, jazz, noam.id, 'ADMIN').expect(200);

    // Assert
    expect(afterDemotion).toHaveLength(1);
    expect(await items(noam)).toMatchObject([{ type: 'COMMUNITY_ADMIN', read: false }]);
  });

  it('tells the new owner after a transfer, and the old owner nothing', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);

    // Act
    await request(app)
      .post(`/api/communities/${jazz}/ownership`)
      .set('Cookie', dana.cookie)
      .send({ userId: noam.id })
      .expect(200);

    // Assert
    expect(await items(noam)).toMatchObject([
      { type: 'COMMUNITY_OWNER', actor: { id: dana.id }, community: { id: jazz } },
    ]);
    expect(await items(dana)).toEqual([]);
  });

  it('hides the notice once the member is removed', async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('Dana'), person('Noam')]);
    const jazz = await community(dana, noam);
    await setRole(dana, jazz, noam.id, 'ADMIN').expect(200);
    await setRole(dana, jazz, noam.id, 'MEMBER').expect(200);

    // Act
    await as(dana).delete(`/api/communities/${jazz}/members/${noam.id}`).expect(200);

    // Assert
    expect(await items(noam)).toEqual([]);
    expect(await unread(noam)).toBe(0);
  });
});
