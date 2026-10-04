import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

const app = createApp();

const PUBLIC_COMMUNITY_KEYS = ['createdAt', 'description', 'id', 'memberCount', 'myRole', 'name'];

async function onboardedUser(googleSub: string, displayName: string) {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName,
      displayNameKey: displayName.toLowerCase(),
      preferredService: 'SPOTIFY',
    },
  });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

async function unfinishedUser() {
  const user = await prisma.user.create({ data: { googleSub: 'sub-unfinished' } });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

/** Creates a community through the API, so its rows are exactly what production writes. */
async function createVia(cookie: string, name: string) {
  const response = await request(app).post('/api/communities').set('Cookie', cookie).send({ name });
  return response.body.data.community as { id: string };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/communities', () => {
  it('creates the community and an OWNER membership, and returns a PublicCommunity', async () => {
    // Arrange
    const { user, cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app)
      .post('/api/communities')
      .set('Cookie', cookie)
      .send({ name: '  Friday   Jazz ', description: 'Late-night records.\nOnly.' });

    // Assert
    expect(response.status).toBe(201);
    const community = response.body.data.community;
    expect(Object.keys(community).sort()).toEqual(PUBLIC_COMMUNITY_KEYS);
    expect(community).toMatchObject({
      name: 'Friday Jazz',
      description: 'Late-night records.\nOnly.',
      memberCount: 1,
      myRole: 'OWNER',
    });
    const row = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: community.id } },
    });
    expect(row?.role).toBe('OWNER');
  });

  it('stores a missing description as null', async () => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app)
      .post('/api/communities')
      .set('Cookie', cookie)
      .send({ name: 'Friday Jazz' });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.data.community.description).toBeNull();
  });

  it('returns 400 for a body that is not JSON', async () => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app)
      .post('/api/communities')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['a missing name', {}],
    ['an empty name', { name: '' }],
    ['a whitespace-only name', { name: '    ' }],
    ['a 41-character name', { name: 'x'.repeat(41) }],
    ['a forbidden character', { name: 'Jazz <script>' }],
    ['a description over 280 characters', { name: 'Jazz', description: 'x'.repeat(281) }],
    ['an unknown key', { name: 'Jazz', coverImageUrl: 'https://img' }],
    ['a name that is not a string', { name: 42 }],
  ])('returns 422 for %s', async (_case, body) => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app).post('/api/communities').set('Cookie', cookie).send(body);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.status).toBe('error');
    expect(await prisma.community.count()).toBe(0);
  });

  it('returns 401 without a session', async () => {
    // Act
    const response = await request(app).post('/api/communities').send({ name: 'Jazz' });

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 403 for a user who has not finished onboarding', async () => {
    // Arrange
    const { cookie } = await unfinishedUser();

    // Act
    const response = await request(app)
      .post('/api/communities')
      .set('Cookie', cookie)
      .send({ name: 'Jazz' });

    // Assert
    expect(response.status).toBe(403);
    expect(await prisma.community.count()).toBe(0);
  });
});

describe('GET /api/communities', () => {
  it("returns only the caller's communities, newest joined first, with member counts", async () => {
    // Arrange
    const ofri = await onboardedUser('sub-1', 'Ofri');
    const dana = await onboardedUser('sub-2', 'Dana');
    const older = await createVia(ofri.cookie, 'Older');
    const newer = await createVia(ofri.cookie, 'Newer');
    await createVia(dana.cookie, 'Not mine');
    // Dana joins Ofri's older community, so its count is 2 (joining arrives in feature 2).
    await prisma.communityMember.create({ data: { userId: dana.user.id, communityId: older.id } });

    // Act
    const response = await request(app).get('/api/communities').set('Cookie', ofri.cookie);

    // Assert
    expect(response.status).toBe(200);
    const list = response.body.data.communities as Array<Record<string, unknown>>;
    expect(list.map(({ id, memberCount }) => ({ id, memberCount }))).toEqual([
      { id: newer.id, memberCount: 1 },
      { id: older.id, memberCount: 2 },
    ]);
    expect(Object.keys(list[0]!).sort()).toEqual(PUBLIC_COMMUNITY_KEYS);
  });

  it('returns an empty list for a user in no communities', async () => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app).get('/api/communities').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.communities).toEqual([]);
  });

  it('returns 401 without a session', async () => {
    // Act & Assert
    expect((await request(app).get('/api/communities')).status).toBe(401);
  });
});

describe('GET /api/communities/:id', () => {
  it('returns the community to a member', async () => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');
    const community = await createVia(cookie, 'Friday Jazz');

    // Act
    const response = await request(app)
      .get(`/api/communities/${community.id}`)
      .set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.community).toMatchObject({
      id: community.id,
      name: 'Friday Jazz',
      myRole: 'OWNER',
    });
  });

  it('returns 404 to a user who is not a member — the same as a missing community', async () => {
    // Arrange
    const ofri = await onboardedUser('sub-1', 'Ofri');
    const dana = await onboardedUser('sub-2', 'Dana');
    const community = await createVia(ofri.cookie, 'Friday Jazz');

    // Act
    const response = await request(app)
      .get(`/api/communities/${community.id}`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', code: 404, message: 'Community not found.' });
  });

  it.each([
    ['an unknown UUID', '00000000-0000-4000-8000-000000000000'],
    ['a malformed id', 'not-a-uuid'],
  ])('returns 404 for %s', async (_case, id) => {
    // Arrange
    const { cookie } = await onboardedUser('sub-1', 'Ofri');

    // Act
    const response = await request(app).get(`/api/communities/${id}`).set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Community not found.');
  });

  it('returns 401 without a session', async () => {
    // Act & Assert
    expect(
      (await request(app).get('/api/communities/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(401);
  });
});
