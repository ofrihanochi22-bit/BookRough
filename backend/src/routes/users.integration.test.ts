import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = vi.fn().mockResolvedValue({});
    verifyIdToken = verifyIdToken;
  },
}));

const app = createApp();

async function newUser(googleSub = 'sub-new', picture: string | null = 'https://pic/google') {
  const user = await prisma.user.create({ data: { googleSub, profilePictureUrl: picture } });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

async function onboardedUser(googleSub: string, displayName: string, key: string) {
  const user = await prisma.user.create({
    data: { googleSub, displayName, displayNameKey: key, preferredService: 'SPOTIFY' },
  });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

beforeEach(async () => {
  await resetDatabase();
  verifyIdToken.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PATCH /api/users/me', () => {
  it('completes onboarding; /auth/me then agrees', async () => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: '  עופרי ', preferredService: 'APPLE_MUSIC' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.needsOnboarding).toBe(false);
    expect(response.body.data.user).toMatchObject({
      displayName: 'עופרי',
      preferredService: 'APPLE_MUSIC',
      profilePictureUrl: null,
    });
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.data.needsOnboarding).toBe(false);
  });

  it('keeps the Google photo when chosen', async () => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'Ofri', preferredService: 'SPOTIFY', useGooglePicture: true });

    // Assert
    expect(response.body.data.user.profilePictureUrl).toBe('https://pic/google');
  });

  it('returns 400 for a body that is not JSON', async () => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"displayName":');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['an empty body', {}],
    ['an extra key', { displayName: 'Ofri', preferredService: 'SPOTIFY', role: 'ADMIN' }],
    ['an invalid name', { displayName: 'a<b', preferredService: 'SPOTIFY' }],
    ['a reserved name', { displayName: 'Admin', preferredService: 'SPOTIFY' }],
    ['an unknown service', { displayName: 'Ofri', preferredService: 'NAPSTER' }],
    ['a missing service while onboarding', { displayName: 'Ofri' }],
    [
      'the Google photo when there is none',
      { displayName: 'Ofri', preferredService: 'SPOTIFY', useGooglePicture: true },
    ],
  ])('returns 422 for %s', async (label, body) => {
    // Arrange
    const { cookie } = await newUser(
      'sub-422',
      label.includes('Google photo') ? null : 'https://pic',
    );

    // Act
    const response = await request(app).patch('/api/users/me').set('Cookie', cookie).send(body);

    // Assert
    expect(response.status).toBe(422);
  });

  it('never lets a client grant itself a role', async () => {
    // Arrange
    const { user, cookie } = await newUser();

    // Act
    await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'Ofri', preferredService: 'SPOTIFY', role: 'ADMIN' });

    // Assert
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
  });

  it.each([
    ['the same name', 'Ofri'],
    ['a case variant', 'OFRI'],
    ['a niqqud variant', 'עוֹפְרִי'],
  ])('returns 409 for %s of an existing name', async (_label, attempt) => {
    // Arrange
    await onboardedUser('sub-a', 'Ofri', 'ofri');
    await onboardedUser('sub-b', 'עופרי', 'עופרי');
    const { cookie } = await newUser('sub-c');

    // Act
    const response = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: attempt, preferredService: 'SPOTIFY' });

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('That display name is already taken.');
  });

  it('returns 401 without a session', async () => {
    // Act
    const response = await request(app)
      .patch('/api/users/me')
      .send({ displayName: 'Ofri', preferredService: 'SPOTIFY' });

    // Assert
    expect(response.status).toBe(401);
  });
});

describe('GET /api/users/display-name-availability', () => {
  it('reports a free name as available', async () => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query({ name: 'Dana' })
      .set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ available: true, reason: null });
  });

  it("reports the caller's own name as available", async () => {
    // Arrange
    const { cookie } = await onboardedUser('sub-a', 'Ofri', 'ofri');

    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query({ name: 'ofri' })
      .set('Cookie', cookie);

    // Assert
    expect(response.body.data.available).toBe(true);
  });

  it("reports someone else's name as taken", async () => {
    // Arrange
    await onboardedUser('sub-a', 'Ofri', 'ofri');
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query({ name: 'Ofri' })
      .set('Cookie', cookie);

    // Assert
    expect(response.body.data).toEqual({ available: false, reason: 'taken' });
  });

  it('reports a reserved name', async () => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query({ name: 'BookRough fan' })
      .set('Cookie', cookie);

    // Assert
    expect(response.body.data).toEqual({ available: false, reason: 'reserved' });
  });

  it.each([
    ['a rule-breaking name', { name: 'a' }],
    ['a missing name', {}],
  ])('returns 422 for %s', async (_label, query) => {
    // Arrange
    const { cookie } = await newUser();

    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query(query)
      .set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(422);
  });

  it('returns 401 without a session', async () => {
    // Act
    const response = await request(app)
      .get('/api/users/display-name-availability')
      .query({ name: 'Dana' });

    // Assert
    expect(response.status).toBe(401);
  });

  it('still answers 404 for an unknown /users path without a session', async () => {
    // Act
    const response = await request(app).get('/api/users/no-such-thing');

    // Assert
    expect(response.status).toBe(404);
  });
});

describe('the Google photo after a decline', () => {
  it('is not stored again on a later sign-in', async () => {
    // Arrange — onboard with the generated avatar.
    const { user, cookie } = await newUser('sub-photo');
    await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'Ofri', preferredService: 'SPOTIFY', useGooglePicture: false });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'sub-photo', picture: 'https://pic/changed' }),
    });

    // Act
    const signIn = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(signIn.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.profilePictureUrl).toBeNull();
    expect(signIn.body.data.user.profilePictureUrl).toBeNull();
  });
});
