import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

const app = createApp();

const INVALID_INVITE =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';
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
      preferredService: 'SPOTIFY',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

/**
 * Ofri owns "Friday Jazz"; Ada is an admin; Mia and Yoav are members; Zed is a
 * stranger. Built through the API wherever the API can do it.
 */
async function community() {
  const [ofri, ada, mia, yoav, zed] = await Promise.all([
    person('sub-ofri', 'Ofri'),
    person('sub-ada', 'Ada'),
    person('sub-mia', 'Mia'),
    person('sub-yoav', 'Yoav'),
    person('sub-zed', 'Zed'),
  ]);
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', ofri.cookie)
    .send({ name: 'Friday Jazz' });
  const id = created.body.data.community.id as string;
  const invite = await request(app).get(`/api/communities/${id}/invite`).set('Cookie', ofri.cookie);
  const token = invite.body.data.invite.token as string;
  for (const member of [ada, mia, yoav]) {
    await request(app).post(`/api/invites/${token}/accept`).set('Cookie', member.cookie);
  }
  await request(app)
    .patch(`/api/communities/${id}/members/${ada.id}`)
    .set('Cookie', ofri.cookie)
    .send({ role: 'ADMIN' });
  return { id, token, ofri, ada, mia, yoav, zed };
}

const at = (id: string, path = '') => `/api/communities/${id}${path}`;

async function roleOf(communityId: string, userId: string) {
  const row = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId } },
  });
  return row?.role ?? null;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /members', () => {
  it('lists owner, admins, members — oldest first — with exactly the public fields', async () => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app).get(at(c.id, '/members')).set('Cookie', c.mia.cookie);

    // Assert
    expect(response.status).toBe(200);
    const members = response.body.data.members as Array<Record<string, unknown>>;
    expect(members.map((m) => [(m.user as { displayName: string }).displayName, m.role])).toEqual([
      ['Ofri', 'OWNER'],
      ['Ada', 'ADMIN'],
      ['Mia', 'MEMBER'],
      ['Yoav', 'MEMBER'],
    ]);
    expect(Object.keys(members[0]!).sort()).toEqual(['joinedAt', 'role', 'user']);
    expect(Object.keys(members[0]!.user as object).sort()).toEqual([
      'displayName',
      'id',
      'profilePictureUrl',
    ]);
  });

  it('returns 404 to a stranger, for an unknown id and for a malformed id; 401 without a session', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app).get(at(c.id, '/members')).set('Cookie', c.zed.cookie),
      request(app).get(at(UNKNOWN_UUID, '/members')).set('Cookie', c.mia.cookie),
      request(app).get(at('nope', '/members')).set('Cookie', c.mia.cookie),
      request(app).get(at(c.id, '/members')),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([404, 404, 404, 401]);
  });
});

describe('DELETE /members/me (leave)', () => {
  it('lets a member leave without blocking them — the link still works for them', async () => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app).delete(at(c.id, '/members/me')).set('Cookie', c.mia.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(await roleOf(c.id, c.mia.id)).toBeNull();
    expect(await prisma.communityBan.count()).toBe(0);
    const rejoin = await request(app)
      .post(`/api/invites/${c.token}/accept`)
      .set('Cookie', c.mia.cookie);
    expect(rejoin.status).toBe(200);
  });

  it('lets an admin leave', async () => {
    // Arrange
    const c = await community();

    // Act & Assert
    expect(
      (await request(app).delete(at(c.id, '/members/me')).set('Cookie', c.ada.cookie)).status,
    ).toBe(200);
  });

  it('refuses the owner with the UC-10 message', async () => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app)
      .delete(at(c.id, '/members/me'))
      .set('Cookie', c.ofri.cookie);

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "You're the owner. Transfer ownership to another member or delete the community before leaving.",
    );
    expect(await roleOf(c.id, c.ofri.id)).toBe('OWNER');
  });

  it('returns 404 to a stranger and 401 without a session', async () => {
    // Arrange
    const c = await community();

    // Act & Assert
    expect(
      (await request(app).delete(at(c.id, '/members/me')).set('Cookie', c.zed.cookie)).status,
    ).toBe(404);
    expect((await request(app).delete(at(c.id, '/members/me'))).status).toBe(401);
  });
});

describe('DELETE /members/:userId (remove and block)', () => {
  it('removes a member and blocks them; the invite then answers as if invalid', async () => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app)
      .delete(at(c.id, `/members/${c.mia.id}`))
      .set('Cookie', c.ada.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(await roleOf(c.id, c.mia.id)).toBeNull();
    const ban = await prisma.communityBan.findUnique({
      where: { communityId_userId: { communityId: c.id, userId: c.mia.id } },
    });
    expect(ban?.bannedById).toBe(c.ada.id);
    const preview = await request(app).get(`/api/invites/${c.token}`).set('Cookie', c.mia.cookie);
    const accept = await request(app)
      .post(`/api/invites/${c.token}/accept`)
      .set('Cookie', c.mia.cookie);
    expect([preview.status, accept.status]).toEqual([404, 404]);
    expect(preview.body.message).toBe(INVALID_INVITE);
    // A signed-out visitor cannot be identified and still sees the preview.
    expect((await request(app).get(`/api/invites/${c.token}`)).status).toBe(200);
  });

  it.each([
    [
      'an admin',
      'ada',
      409,
      'Cannot remove an Admin. You must demote this user to a standard member before removing them.',
    ],
    ['the owner', 'ofri', 409, "The owner can't be removed."],
  ] as const)('refuses to remove %s', async (_case, target, status, message) => {
    // Arrange
    const c = await community();
    const caller = target === 'ada' ? c.ofri : c.ada;

    // Act
    const response = await request(app)
      .delete(at(c.id, `/members/${c[target].id}`))
      .set('Cookie', caller.cookie);

    // Assert
    expect(response.status).toBe(status);
    expect(response.body.message).toBe(message);
  });

  it('refuses a plain member (403), the caller themselves (422), a non-member and a malformed id (404)', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app)
        .delete(at(c.id, `/members/${c.yoav.id}`))
        .set('Cookie', c.mia.cookie),
      request(app)
        .delete(at(c.id, `/members/${c.ada.id}`))
        .set('Cookie', c.ada.cookie),
      request(app)
        .delete(at(c.id, `/members/${c.zed.id}`))
        .set('Cookie', c.ada.cookie),
      request(app).delete(at(c.id, '/members/not-a-uuid')).set('Cookie', c.ada.cookie),
      request(app).delete(at(c.id, `/members/${c.yoav.id}`)),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([403, 422, 404, 404, 401]);
    expect(await roleOf(c.id, c.yoav.id)).toBe('MEMBER');
  });
});

describe('PATCH /members/:userId (roles)', () => {
  it('promotes and demotes; an admin may demote themselves', async () => {
    // Arrange
    const c = await community();

    // Act
    const promote = await request(app)
      .patch(at(c.id, `/members/${c.mia.id}`))
      .set('Cookie', c.ada.cookie)
      .send({ role: 'ADMIN' });
    const selfDemote = await request(app)
      .patch(at(c.id, `/members/${c.ada.id}`))
      .set('Cookie', c.ada.cookie)
      .send({ role: 'MEMBER' });

    // Assert
    expect(promote.status).toBe(200);
    expect(promote.body.data.member).toMatchObject({ role: 'ADMIN', user: { id: c.mia.id } });
    expect(selfDemote.status).toBe(200);
    expect(await roleOf(c.id, c.ada.id)).toBe('MEMBER');
  });

  it("refuses to change the owner's role (409), a plain member's attempt (403), and OWNER in the body (422)", async () => {
    // Arrange
    const c = await community();

    // Act
    const owner = await request(app)
      .patch(at(c.id, `/members/${c.ofri.id}`))
      .set('Cookie', c.ada.cookie)
      .send({ role: 'MEMBER' });
    const member = await request(app)
      .patch(at(c.id, `/members/${c.yoav.id}`))
      .set('Cookie', c.mia.cookie)
      .send({ role: 'ADMIN' });
    const ownerRole = await request(app)
      .patch(at(c.id, `/members/${c.mia.id}`))
      .set('Cookie', c.ofri.cookie)
      .send({ role: 'OWNER' });
    const extraKey = await request(app)
      .patch(at(c.id, `/members/${c.mia.id}`))
      .set('Cookie', c.ofri.cookie)
      .send({ role: 'ADMIN', note: 'x' });

    // Assert
    expect([owner.status, member.status, ownerRole.status, extraKey.status]).toEqual([
      409, 403, 422, 422,
    ]);
    expect(owner.body.message).toBe(
      "The owner's role can't be changed. Transfer ownership instead.",
    );
    expect(await roleOf(c.id, c.ofri.id)).toBe('OWNER');
  });

  it('returns 404 for a non-member target and a malformed id, 400 for bad JSON, 401 without a session', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app)
        .patch(at(c.id, `/members/${c.zed.id}`))
        .set('Cookie', c.ofri.cookie)
        .send({ role: 'ADMIN' }),
      request(app)
        .patch(at(c.id, '/members/nope'))
        .set('Cookie', c.ofri.cookie)
        .send({ role: 'ADMIN' }),
      request(app)
        .patch(at(c.id, `/members/${c.mia.id}`))
        .set('Cookie', c.ofri.cookie)
        .set('Content-Type', 'application/json')
        .send('{"role":'),
      request(app)
        .patch(at(c.id, `/members/${c.mia.id}`))
        .send({ role: 'ADMIN' }),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([404, 404, 400, 401]);
  });
});

describe('POST /ownership', () => {
  it('makes the target owner and the old owner an admin, who can then leave', async () => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app)
      .post(at(c.id, '/ownership'))
      .set('Cookie', c.ofri.cookie)
      .send({ userId: c.mia.id });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.community.myRole).toBe('ADMIN');
    expect(await roleOf(c.id, c.mia.id)).toBe('OWNER');
    expect(await roleOf(c.id, c.ofri.id)).toBe('ADMIN');
    expect(
      (await request(app).delete(at(c.id, '/members/me')).set('Cookie', c.ofri.cookie)).status,
    ).toBe(200);
  });

  it('refuses an admin (403), the owner themselves (422), a non-member (404) and a bad body (422)', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app)
        .post(at(c.id, '/ownership'))
        .set('Cookie', c.ada.cookie)
        .send({ userId: c.mia.id }),
      request(app)
        .post(at(c.id, '/ownership'))
        .set('Cookie', c.ofri.cookie)
        .send({ userId: c.ofri.id }),
      request(app)
        .post(at(c.id, '/ownership'))
        .set('Cookie', c.ofri.cookie)
        .send({ userId: c.zed.id }),
      request(app)
        .post(at(c.id, '/ownership'))
        .set('Cookie', c.ofri.cookie)
        .send({ userId: 'nope' }),
      request(app).post(at(c.id, '/ownership')).send({ userId: c.mia.id }),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([403, 422, 404, 422, 401]);
    expect(await roleOf(c.id, c.ofri.id)).toBe('OWNER');
  });

  it('refuses a second transfer by someone who is no longer the owner', async () => {
    // Arrange
    const c = await community();
    await request(app)
      .post(at(c.id, '/ownership'))
      .set('Cookie', c.ofri.cookie)
      .send({ userId: c.mia.id });

    // Act
    const second = await request(app)
      .post(at(c.id, '/ownership'))
      .set('Cookie', c.ofri.cookie)
      .send({ userId: c.yoav.id });

    // Assert
    expect(second.status).toBe(403);
    expect(
      await prisma.communityMember.count({ where: { communityId: c.id, role: 'OWNER' } }),
    ).toBe(1);
  });
});

describe('blocked list', () => {
  it('lists blocked people newest first to admins, and unblocking lets them rejoin', async () => {
    // Arrange
    const c = await community();
    await request(app)
      .delete(at(c.id, `/members/${c.mia.id}`))
      .set('Cookie', c.ofri.cookie);
    await request(app)
      .delete(at(c.id, `/members/${c.yoav.id}`))
      .set('Cookie', c.ofri.cookie);

    // Act
    const list = await request(app).get(at(c.id, '/bans')).set('Cookie', c.ada.cookie);
    const unblock = await request(app)
      .delete(at(c.id, `/bans/${c.mia.id}`))
      .set('Cookie', c.ada.cookie);

    // Assert
    expect(list.status).toBe(200);
    const blocked = list.body.data.blocked as Array<{ user: { displayName: string } }>;
    expect(blocked.map((b) => b.user.displayName)).toEqual(['Yoav', 'Mia']);
    expect(Object.keys(blocked[0]!).sort()).toEqual(['blockedAt', 'user']);
    expect(unblock.status).toBe(200);
    expect(await roleOf(c.id, c.mia.id)).toBeNull(); // not re-added
    const rejoin = await request(app)
      .post(`/api/invites/${c.token}/accept`)
      .set('Cookie', c.mia.cookie);
    expect(rejoin.status).toBe(200);
  });

  it('refuses members (403) and strangers (404); unblocking someone not blocked is 404', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app).get(at(c.id, '/bans')).set('Cookie', c.mia.cookie),
      request(app).get(at(c.id, '/bans')).set('Cookie', c.zed.cookie),
      request(app)
        .delete(at(c.id, `/bans/${c.yoav.id}`))
        .set('Cookie', c.ofri.cookie),
      request(app).delete(at(c.id, '/bans/nope')).set('Cookie', c.ofri.cookie),
      request(app)
        .delete(at(c.id, `/bans/${c.yoav.id}`))
        .set('Cookie', c.mia.cookie),
      request(app).get(at(c.id, '/bans')),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([403, 404, 404, 404, 403, 401]);
  });
});

describe('PATCH / (edit details)', () => {
  it('lets an admin rename and clear the description, with the creation rules', async () => {
    // Arrange
    const c = await community();
    await request(app)
      .patch(at(c.id))
      .set('Cookie', c.ofri.cookie)
      .send({ description: 'Records.' });

    // Act
    const response = await request(app)
      .patch(at(c.id))
      .set('Cookie', c.ada.cookie)
      .send({ name: '  Friday   Jazz Club ', description: '   ' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.community).toMatchObject({
      name: 'Friday Jazz Club',
      description: null,
      myRole: 'ADMIN',
    });
  });

  it.each([
    ['an empty body', {}],
    ['an unknown key', { name: 'Jazz', cover: 'x' }],
    ['a one-character name', { name: 'x' }],
    ['a forbidden character', { name: 'Jazz <b>' }],
    ['a 281-character description', { description: 'x'.repeat(281) }],
  ])('returns 422 for %s', async (_case, body) => {
    // Arrange
    const c = await community();

    // Act
    const response = await request(app).patch(at(c.id)).set('Cookie', c.ofri.cookie).send(body);

    // Assert
    expect(response.status).toBe(422);
  });

  it('refuses a member (403) and a stranger (404); 400 for bad JSON; 401 without a session', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app).patch(at(c.id)).set('Cookie', c.mia.cookie).send({ name: 'Mine' }),
      request(app).patch(at(c.id)).set('Cookie', c.zed.cookie).send({ name: 'Mine' }),
      request(app)
        .patch(at(c.id))
        .set('Cookie', c.ofri.cookie)
        .set('Content-Type', 'application/json')
        .send('{"name":'),
      request(app).patch(at(c.id)).send({ name: 'Mine' }),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([403, 404, 400, 401]);
  });
});

describe('DELETE / (delete community)', () => {
  it('lets the owner delete; memberships, blocks and the invite link go with it', async () => {
    // Arrange
    const c = await community();
    await request(app)
      .delete(at(c.id, `/members/${c.yoav.id}`))
      .set('Cookie', c.ofri.cookie);

    // Act
    const response = await request(app).delete(at(c.id)).set('Cookie', c.ofri.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect((await request(app).get(at(c.id)).set('Cookie', c.mia.cookie)).status).toBe(404);
    expect(await prisma.communityMember.count({ where: { communityId: c.id } })).toBe(0);
    expect(await prisma.communityBan.count({ where: { communityId: c.id } })).toBe(0);
    expect((await request(app).get(`/api/invites/${c.token}`)).status).toBe(404);
  });

  it('refuses an admin (403), a member (403), a stranger (404); 401 without a session', async () => {
    // Arrange
    const c = await community();

    // Act
    const statuses = await Promise.all([
      request(app).delete(at(c.id)).set('Cookie', c.ada.cookie),
      request(app).delete(at(c.id)).set('Cookie', c.mia.cookie),
      request(app).delete(at(c.id)).set('Cookie', c.zed.cookie),
      request(app).delete(at(c.id)),
    ]).then((responses) => responses.map((r) => r.status));

    // Assert
    expect(statuses).toEqual([403, 403, 404, 401]);
    expect(await prisma.community.count()).toBe(1);
  });
});

describe('the one-owner rule in the database', () => {
  it('rejects a second OWNER even when written directly (the partial unique index)', async () => {
    // Arrange
    const c = await community();

    // Act
    const write = prisma.communityMember.update({
      where: { userId_communityId: { userId: c.ada.id, communityId: c.id } },
      data: { role: 'OWNER' },
    });

    // Assert
    await expect(write).rejects.toMatchObject({ code: 'P2002' });
  });

  it('the backfill migration makes the earliest admin of an ownerless community its owner', async () => {
    // Arrange — a community as it looked before the owner role existed.
    const first = await person('sub-first', 'First');
    const later = await person('sub-later', 'Later');
    const old = await prisma.community.create({ data: { name: 'Old Times' } });
    await prisma.communityMember.create({
      data: {
        userId: first.id,
        communityId: old.id,
        role: 'ADMIN',
        joinedAt: new Date('2026-01-01'),
      },
    });
    await prisma.communityMember.create({
      data: {
        userId: later.id,
        communityId: old.id,
        role: 'ADMIN',
        joinedAt: new Date('2026-02-01'),
      },
    });
    const migrations = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
    const folder = readdirSync(migrations).find((name) =>
      name.endsWith('_backfill_community_owners'),
    )!;
    const sql = readFileSync(`${migrations}/${folder}/migration.sql`, 'utf8');
    const backfill = sql.slice(0, sql.indexOf('CREATE UNIQUE INDEX'));

    // Act
    await prisma.$executeRawUnsafe(backfill);

    // Assert
    expect(await roleOf(old.id, first.id)).toBe('OWNER');
    expect(await roleOf(old.id, later.id)).toBe('ADMIN');
  });
});

describe('creating a community', () => {
  it('makes the creator its OWNER', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');

    // Act
    const response = await request(app)
      .post('/api/communities')
      .set('Cookie', ofri.cookie)
      .send({ name: 'Mine' });

    // Assert
    expect(response.body.data.community.myRole).toBe('OWNER');
  });
});
