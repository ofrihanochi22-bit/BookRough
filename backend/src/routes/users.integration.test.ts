import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

const { getCerts, verifyIdToken } = vi.hoisted(() => ({
  getCerts: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = getCerts;
    verifyIdToken = verifyIdToken;
  },
}));

// --- Log capture: the logger is silent in tests, so this suite swaps in one
// that records every line, for the photo re-choose privacy check. ---
const { logLines } = vi.hoisted(() => ({ logLines: [] as string[] }));

vi.mock('../utils/logger.js', async () => {
  const { default: pino } = await import('pino');
  const { Writable } = await import('node:stream');
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      logLines.push(chunk.toString());
      done();
    },
  });
  const logger = pino({ level: 'debug', base: null }, sink);
  return { logger, createLogger: (context: string) => logger.child({ context }) };
});

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
  logLines.length = 0;
  getCerts.mockReset().mockResolvedValue({});
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

describe('POST /api/users/me/google-picture', () => {
  const LEAK_EMAIL = 'leak-check@example.com';
  const LEAK_NAME = 'Leak Check';

  /** Google accepts the token; the payload carries claims we must never keep. */
  function acceptToken(sub: string, picture: string | null = 'https://pic/fresh') {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub,
        picture: picture ?? undefined,
        email: LEAK_EMAIL,
        name: LEAK_NAME,
      }),
    });
  }

  /** Onboarded with the generated avatar: the Google photo was declined. */
  async function declinedUser(googleSub = 'sub-photo') {
    return onboardedUser(googleSub, 'Ofri', 'ofri');
  }

  function post(cookie: string | null, body: object = { credential: 'tok' }) {
    const req = request(app).post('/api/users/me/google-picture');
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  }

  it('stores the fresh photo and returns the session', async () => {
    // Arrange
    const { user, cookie } = await declinedUser();
    acceptToken('sub-photo');

    // Act
    const response = await post(cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      user: expect.objectContaining({ id: user.id, profilePictureUrl: 'https://pic/fresh' }),
      needsOnboarding: false,
      isAdmin: false,
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.profilePictureUrl).toBe('https://pic/fresh');
    expect(row.useGooglePicture).toBe(true);
  });

  it('keeps the photo fresh on later sign-ins, and the switch back removes it', async () => {
    // Arrange
    const { user, cookie } = await declinedUser();
    acceptToken('sub-photo');
    await post(cookie);
    acceptToken('sub-photo', 'https://pic/changed');

    // Act
    const signIn = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    const afterSignIn = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const switchBack = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ useGooglePicture: false });

    // Assert
    expect(signIn.status).toBe(200);
    expect(afterSignIn.profilePictureUrl).toBe('https://pic/changed');
    expect(switchBack.status).toBe(200);
    expect(switchBack.body.data.user.profilePictureUrl).toBeNull();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ profilePictureUrl: null, useGooglePicture: false });
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    // Arrange
    const { cookie } = await declinedUser();

    // Act
    const response = await request(app)
      .post('/api/users/me/google-picture')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"credential":');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['a missing credential', {}],
    ['an empty credential', { credential: '' }],
    ['a non-string credential', { credential: 42 }],
    ['an extra key', { credential: 'tok', picture: 'https://evil/pic' }],
  ])('returns 422 for %s, never asking Google', async (_label, body) => {
    // Arrange
    const { cookie } = await declinedUser();

    // Act
    const response = await post(cookie, body);

    // Assert
    expect(response.status).toBe(422);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an invalid token',
      () => verifyIdToken.mockRejectedValue(new Error('Token used too late')),
      422,
      "Google sign-in didn't complete. Please try again.",
    ],
    [
      'a Google account with no photo',
      () => acceptToken('sub-photo', null),
      422,
      'Your Google account has no photo.',
    ],
    [
      'a different Google account',
      () => acceptToken('sub-someone-else'),
      403,
      "That's a different Google account. Use the account you signed up with.",
    ],
  ])('refuses %s, keeps the row and the session', async (_label, arrange, status, message) => {
    // Arrange
    const { user, cookie } = await declinedUser();
    arrange();

    // Act
    const response = await post(cookie);

    // Assert
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ status: 'error', code: status, message });
    expect(response.headers['set-cookie']).toBeUndefined();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ profilePictureUrl: null, useGooglePicture: false });
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
  });

  it('returns 403 for a user who has not finished onboarding', async () => {
    // Arrange
    const { cookie } = await newUser('sub-photo');
    acceptToken('sub-photo');

    // Act
    const response = await post(cookie);

    // Assert
    expect(response.status).toBe(403);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 503 when Google signing keys are unreachable', async () => {
    // Arrange
    const { cookie } = await declinedUser();
    getCerts.mockRejectedValue(new Error('ENOTFOUND'));

    // Act
    const response = await post(cookie);

    // Assert
    expect(response.status).toBe(503);
  });

  it('returns 401 without a session', async () => {
    // Act
    const response = await post(null);

    // Assert
    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('never stores, returns, or logs the email or real name from the token', async () => {
    // Arrange
    const { cookie } = await declinedUser();
    acceptToken('sub-photo');

    // Act
    const response = await post(cookie);

    // Assert - the database row, the response body, and every log line.
    const rows = await prisma.$queryRawUnsafe<unknown[]>('SELECT * FROM "users"');
    const everything = [JSON.stringify(rows), JSON.stringify(response.body), ...logLines].join(
      '\n',
    );
    expect(response.status).toBe(200);
    expect(logLines.length).toBeGreaterThan(0);
    expect(everything).not.toContain(LEAK_EMAIL);
    expect(everything).not.toContain(LEAK_NAME);
  });
});
