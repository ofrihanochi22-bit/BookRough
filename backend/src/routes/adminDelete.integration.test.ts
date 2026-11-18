import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';

/** docs/features/admin-delete.md §7 — the three endpoints against Postgres. */

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = vi.fn().mockResolvedValue({});
    verifyIdToken = verifyIdToken;
  },
}));

const app = createApp();
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

interface Session {
  id: string;
  cookie: string;
}

async function signUp(sub: string, intent?: 'signup'): Promise<Session> {
  verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub, picture: 'https://pic/g' }) });
  const response = await request(app)
    .post('/api/auth/google')
    .send({ credential: 'tok', ...(intent ? { intent } : {}) });
  const header = [response.headers['set-cookie'] ?? []]
    .flat()
    .find((v: string) => v.startsWith('token='));
  const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: sub } });
  return { id: user.id, cookie: header!.split(';')[0]! };
}

async function person(sub: string, displayName: string): Promise<Session> {
  const session = await signUp(sub);
  await request(app)
    .patch('/api/users/me')
    .set('Cookie', session.cookie)
    .send({ displayName, preferredService: 'SPOTIFY', useGooglePicture: false });
  return session;
}

async function admin(sub = 'sub-boss', name = 'Boss'): Promise<Session> {
  const session = await person(sub, name);
  await prisma.user.update({ where: { id: session.id }, data: { role: 'ADMIN' } });
  return session;
}

/** A community with its members, joined in the given order a second apart. */
async function community(
  name: string,
  members: { id: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }[],
): Promise<string> {
  const created = await prisma.community.create({ data: { name } });
  const start = Date.now() - 60_000;
  await prisma.communityMember.createMany({
    data: members.map((m, i) => ({
      communityId: created.id,
      userId: m.id,
      role: m.role,
      joinedAt: new Date(start + i * 1000),
    })),
  });
  return created.id;
}

function post(authorId: string, communityId: string) {
  return prisma.post.create({
    data: {
      authorId,
      communityId,
      originalUrl: 'https://open.spotify.com/track/abc',
      sourceService: 'SPOTIFY',
      songTitle: 'Blue in Green',
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  verifyIdToken.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/admin/users/:userId/deletion-preview', () => {
  it('200: counts, a transfer to the oldest admin, and a sole-member deletion', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    const ada = await person('sub-ada', 'Ada');
    const bo = await person('sub-bo', 'Bo');
    const jazz = await community('Jazz', [
      { id: mia.id, role: 'OWNER' },
      { id: bo.id, role: 'MEMBER' },
      { id: ada.id, role: 'ADMIN' },
    ]);
    const solo = await community('Solo', [{ id: mia.id, role: 'OWNER' }]);
    const p = await post(mia.id, jazz);
    const rating = await prisma.rating.create({ data: { postId: p.id, userId: mia.id, score: 8 } });
    await prisma.comment.create({ data: { postId: p.id, authorId: mia.id, body: 'yes' } });

    // Act
    const response = await request(app)
      .get(`/api/admin/users/${mia.id}/deletion-preview`)
      .set('Cookie', boss.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(rating.score).toBe(8);
    const preview = response.body.data.preview;
    expect(preview.displayName).toBe('Mia');
    expect(preview.counts).toEqual({ posts: 1, ratings: 1, comments: 1 });
    expect(preview.communities).toEqual(
      expect.arrayContaining([
        {
          id: jazz,
          name: 'Jazz',
          outcome: 'TRANSFER',
          newOwner: { id: ada.id, displayName: 'Ada' },
        },
        { id: solo, name: 'Solo', outcome: 'DELETE' },
      ]),
    );
  });
});

describe('DELETE /api/admin/users/:userId', () => {
  it('200: removes everything of theirs, hands the community over, and ends their session', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    const ada = await person('sub-ada', 'Ada');
    const bo = await person('sub-bo', 'Bo');
    const jazz = await community('Jazz', [
      { id: mia.id, role: 'OWNER' },
      { id: bo.id, role: 'MEMBER' },
      { id: ada.id, role: 'MEMBER' },
    ]);
    const solo = await community('Solo', [{ id: mia.id, role: 'OWNER' }]);
    const bosPost = await post(bo.id, jazz);
    await post(mia.id, jazz);
    const review = await prisma.rating.create({
      data: { postId: bosPost.id, userId: mia.id, score: 9 },
    });
    const othersReply = await prisma.comment.create({
      data: { postId: bosPost.id, authorId: ada.id, ratingId: review.id, body: 'agreed' },
    });
    await prisma.comment.create({ data: { postId: bosPost.id, authorId: mia.id, body: 'mine' } });

    // Act
    const response = await request(app)
      .delete(`/api/admin/users/${mia.id}`)
      .set('Cookie', boss.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      transferred: [{ communityId: jazz, newOwnerId: bo.id }],
      deletedCommunities: [solo],
    });
    expect(await prisma.user.findUnique({ where: { id: mia.id } })).toBeNull();
    expect(await prisma.post.count({ where: { authorId: mia.id } })).toBe(0);
    expect(await prisma.comment.count({ where: { authorId: mia.id } })).toBe(0);
    expect(await prisma.comment.findUnique({ where: { id: othersReply.id } })).toBeNull();
    expect(await prisma.community.findUnique({ where: { id: solo } })).toBeNull();
    const owner = await prisma.communityMember.findFirst({
      where: { communityId: jazz, role: 'OWNER' },
    });
    expect(owner?.userId).toBe(bo.id);
    const notice = await prisma.notification.findFirst({
      where: { userId: bo.id, type: 'COMMUNITY_OWNER', communityId: jazz },
    });
    expect(notice?.actorId).toBe(boss.id);
    const me = await request(app).get('/api/auth/me').set('Cookie', mia.cookie);
    expect(me.status).toBe(401);
  });

  it('lets the same Google account sign up again as a new, empty account', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    await request(app).delete(`/api/admin/users/${mia.id}`).set('Cookie', boss.cookie);

    // Act
    const again = await signUp('sub-mia', 'signup');

    // Assert
    expect(again.id).not.toBe(mia.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: again.id } });
    expect(user.displayName).toBeNull();
  });

  it('rolls everything back when a step fails mid-transaction', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    const bo = await person('sub-bo', 'Bo');
    const jazz = await community('Jazz', [
      { id: mia.id, role: 'OWNER' },
      { id: bo.id, role: 'MEMBER' },
    ]);
    const solo = await community('Solo', [{ id: mia.id, role: 'OWNER' }]);
    // A failure at the last step, the user's own delete, after the community steps ran.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_refuse_user_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'connection lost'; END $$`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_refuse_user_delete BEFORE DELETE ON users
      FOR EACH ROW EXECUTE FUNCTION test_refuse_user_delete()`);

    // Act
    let response;
    try {
      response = await request(app).delete(`/api/admin/users/${mia.id}`).set('Cookie', boss.cookie);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_refuse_user_delete ON users');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_refuse_user_delete()');
    }

    // Assert
    expect(response.status).toBe(500);
    expect(await prisma.user.findUnique({ where: { id: mia.id } })).not.toBeNull();
    expect(await prisma.community.findUnique({ where: { id: solo } })).not.toBeNull();
    const owner = await prisma.communityMember.findFirst({
      where: { communityId: jazz, role: 'OWNER' },
    });
    expect(owner?.userId).toBe(mia.id);
    expect(await prisma.notification.count({ where: { type: 'COMMUNITY_OWNER' } })).toBe(0);
  });
});

describe('DELETE /api/admin/communities/:communityId', () => {
  it('204: the community and its posts go, and each former member is told its name', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    const bo = await person('sub-bo', 'Bo');
    const jazz = await community('Jazz', [
      { id: mia.id, role: 'OWNER' },
      { id: bo.id, role: 'MEMBER' },
    ]);
    await post(bo.id, jazz);

    // Act
    const response = await request(app)
      .delete(`/api/admin/communities/${jazz}`)
      .set('Cookie', boss.cookie);

    // Assert
    expect(response.status).toBe(204);
    expect(await prisma.community.findUnique({ where: { id: jazz } })).toBeNull();
    expect(await prisma.post.count({ where: { communityId: jazz } })).toBe(0);
    expect(await prisma.communityMember.count({ where: { communityId: jazz } })).toBe(0);
    for (const member of [mia, bo]) {
      const list = await request(app).get('/api/notifications').set('Cookie', member.cookie);
      expect(list.body.data.items).toEqual([
        expect.objectContaining({
          type: 'COMMUNITY_REMOVED',
          communityName: 'Jazz',
          actor: null,
          community: null,
        }),
      ]);
    }
  });
});

describe('the refusals', () => {
  const routes = (userId: string, communityId: string) => [
    { method: 'get' as const, path: `/api/admin/users/${userId}/deletion-preview` },
    { method: 'delete' as const, path: `/api/admin/users/${userId}` },
    { method: 'delete' as const, path: `/api/admin/communities/${communityId}` },
  ];

  it('400: a malformed id on each route', async () => {
    // Arrange
    const boss = await admin();

    // Act + Assert
    for (const route of routes('not-a-uuid', 'not-a-uuid')) {
      const response = await request(app)[route.method](route.path).set('Cookie', boss.cookie);
      expect(response.status, route.path).toBe(400);
    }
  });

  it('401: no cookie on each route', async () => {
    // Act + Assert
    for (const route of routes(UNKNOWN, UNKNOWN)) {
      const response = await request(app)[route.method](route.path);
      expect(response.status, route.path).toBe(401);
    }
  });

  it('403: a non-admin on each route, and nothing is deleted', async () => {
    // Arrange
    const mia = await person('sub-mia', 'Mia');
    const bo = await person('sub-bo', 'Bo');
    const jazz = await community('Jazz', [{ id: bo.id, role: 'OWNER' }]);

    // Act + Assert
    for (const route of routes(bo.id, jazz)) {
      const response = await request(app)[route.method](route.path).set('Cookie', mia.cookie);
      expect(response.status, route.path).toBe(403);
    }
    expect(await prisma.user.findUnique({ where: { id: bo.id } })).not.toBeNull();
    expect(await prisma.community.findUnique({ where: { id: jazz } })).not.toBeNull();
  });

  it('403: an admin targeting another admin, or themself', async () => {
    // Arrange
    const boss = await admin();
    const other = await admin('sub-other', 'Other');

    // Act
    const preview = await request(app)
      .get(`/api/admin/users/${other.id}/deletion-preview`)
      .set('Cookie', boss.cookie);
    const otherAdmin = await request(app)
      .delete(`/api/admin/users/${other.id}`)
      .set('Cookie', boss.cookie);
    const self = await request(app)
      .delete(`/api/admin/users/${boss.id}`)
      .set('Cookie', boss.cookie);

    // Assert
    expect(preview.status).toBe(403);
    expect(otherAdmin.status).toBe(403);
    expect(otherAdmin.body.message).toBe("Admins can't be deleted here.");
    expect(self.status).toBe(403);
    expect(self.body.message).toBe("You can't delete yourself.");
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(2);
  });

  it('404: unknown targets, and a second delete of the same one', async () => {
    // Arrange
    const boss = await admin();
    const mia = await person('sub-mia', 'Mia');
    const jazz = await community('Jazz', [{ id: mia.id, role: 'OWNER' }]);
    await request(app).delete(`/api/admin/communities/${jazz}`).set('Cookie', boss.cookie);
    await request(app).delete(`/api/admin/users/${mia.id}`).set('Cookie', boss.cookie);

    // Act + Assert
    for (const route of [...routes(UNKNOWN, UNKNOWN), ...routes(mia.id, jazz)]) {
      const response = await request(app)[route.method](route.path).set('Cookie', boss.cookie);
      expect(response.status, route.path).toBe(404);
    }
  });
});

describe('the CHECK notifications_removed_shape', () => {
  it('refuses a COMMUNITY_REMOVED row without a name, and another type with one', async () => {
    // Arrange
    const mia = await person('sub-mia', 'Mia');
    const bo = await person('sub-bo', 'Bo');

    // Act
    const noName = prisma.notification.create({
      data: { userId: mia.id, actorId: bo.id, type: 'COMMUNITY_REMOVED' },
    });
    const named = prisma.notification.create({
      data: { userId: mia.id, actorId: bo.id, type: 'FRIEND_REQUEST', communityName: 'Jazz' },
    });

    // Assert
    await expect(noName).rejects.toThrow(/notifications_removed_shape/);
    await expect(named).rejects.toThrow(/notifications_removed_shape/);
  });
});
