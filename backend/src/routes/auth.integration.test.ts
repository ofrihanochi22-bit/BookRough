import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { SESSION_TTL_SECONDS, signSessionToken } from '../utils/jwt.js';

// --- External boundary: Google is mocked, never called (docs/tests.md §3.4) ---
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
// that records every line, for the privacy regression test. ---
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
const DAY = 24 * 60 * 60;
const LEAK_EMAIL = 'leak-check@example.com';
const LEAK_NAME = 'Leak Check';

/** A verified Google payload, carrying the claims we must never keep. */
function googlePayload(sub = 'google-sub-1', picture: string | undefined = 'https://pic/1') {
  return { sub, picture, email: LEAK_EMAIL, name: LEAK_NAME, email_verified: true };
}

function acceptToken(payload: Record<string, unknown> = googlePayload()) {
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

/** The cookie as Supertest sends it back, from a Set-Cookie header. */
function sessionCookieFrom(setCookie: string[] | string | undefined): string {
  const header = [setCookie ?? []].flat().find((value) => value.startsWith('token='));
  if (!header) {
    throw new Error('no session cookie was set');
  }
  return header.split(';')[0]!;
}

function tokenCookie(token: string): string {
  return `token=${token}`;
}

async function createUser(googleSub = 'google-sub-1') {
  return prisma.user.create({ data: { googleSub } });
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

describe('POST /api/auth/google', () => {
  it('creates a user on first sign-in and sets an HttpOnly, SameSite=Lax session cookie', async () => {
    // Arrange
    acceptToken();

    // Act
    const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.needsOnboarding).toBe(true);
    expect(response.body.data.user).toMatchObject({
      displayName: null,
      preferredService: null,
      profilePictureUrl: 'https://pic/1',
    });

    const setCookie = [response.headers['set-cookie']].flat().join('\n');
    expect(setCookie).toMatch(/token=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(await prisma.user.count()).toBe(1);
  });

  it('signs a returning user in to the same row', async () => {
    // Arrange
    acceptToken();
    const first = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Act
    const second = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('reports needsOnboarding false for a user who finished onboarding', async () => {
    // Arrange
    await prisma.user.create({
      data: {
        googleSub: 'google-sub-1',
        displayName: 'Ofri',
        displayNameKey: 'ofri',
        preferredService: 'SPOTIFY',
      },
    });
    acceptToken();

    // Act
    const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(response.body.data.needsOnboarding).toBe(false);
    expect(response.body.data.user.displayName).toBe('Ofri');
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    // Act
    const response = await request(app)
      .post('/api/auth/google')
      .set('Content-Type', 'application/json')
      .send('{"credential":');

    // Assert
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      code: 400,
      message: 'The request body is not valid JSON.',
    });
  });

  it('passes through other client-side body errors with their own status (415 charset)', async () => {
    // Act
    const response = await request(app)
      .post('/api/auth/google')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{"credential":"tok"}');

    // Assert
    expect(response.status).toBe(415);
    expect(response.body.status).toBe('error');
  });

  it.each([
    ['a missing credential', {}],
    ['an empty credential', { credential: '' }],
    ['an over-long credential', { credential: 'x'.repeat(4097) }],
    ['an extra key', { credential: 'tok', email: 'x@y.z' }],
    ['a non-string credential', { credential: 42 }],
  ])('returns 422 for %s', async (_label, body) => {
    // Act
    const response = await request(app).post('/api/auth/google').send(body);

    // Assert
    expect(response.status).toBe(422);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 422 for a form-encoded post (login CSRF), never reaching Google', async () => {
    // Act
    const response = await request(app)
      .post('/api/auth/google')
      .type('form')
      .send({ credential: 'tok' });

    // Assert
    expect(response.status).toBe(422);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid signature', 'Invalid token signature: eyJhbGciOi...'],
    ['the wrong audience', 'Wrong recipient, payload audience != requiredAudience'],
    ['an expired token', 'Token used too late, 2 > 1: {"sub":"x"}'],
  ])('returns 401 for %s and creates no user', async (_label, message) => {
    // Arrange
    verifyIdToken.mockRejectedValue(new Error(message));

    // Act
    const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Google sign-in failed. Please try again.');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
  });

  it('returns 503 when Google signing keys are unreachable', async () => {
    // Arrange
    getCerts.mockRejectedValue(new Error('getaddrinfo ENOTFOUND www.googleapis.com'));

    // Act
    const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });

    // Assert
    expect(response.status).toBe(503);
    expect(response.body.message).toBe('Google sign-in is temporarily unavailable.');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the session user for a valid cookie', async () => {
    // Arrange
    acceptToken();
    const signIn = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    const cookie = sessionCookieFrom(signIn.headers['set-cookie']);

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(signIn.body.data);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('renews a token older than 15 days', async () => {
    // Arrange
    const user = await createUser();
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt.sign({ iat: now - 16 * DAY }, process.env.JWT_SECRET!, {
      subject: user.id,
      expiresIn: SESSION_TTL_SECONDS,
    });

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', tokenCookie(oldToken));

    // Assert
    expect(response.status).toBe(200);
    const renewed = sessionCookieFrom(response.headers['set-cookie']).slice('token='.length);
    expect(renewed).not.toBe(oldToken);
    const claims = jwt.decode(renewed) as { iat: number };
    expect(claims.iat).toBeGreaterThanOrEqual(now);
  });

  it('returns 401 without a cookie', async () => {
    // Act
    const response = await request(app).get('/api/auth/me');

    // Assert
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ status: 'error', code: 401, message: 'Please sign in.' });
  });

  it('returns 401 and clears the cookie for a tampered token', async () => {
    // Arrange
    const user = await createUser();
    const token = signSessionToken(user.id);
    const tampered = `${token.slice(0, -2)}xx`;

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', tokenCookie(tampered));

    // Assert
    expect(response.status).toBe(401);
    expect([response.headers['set-cookie']].flat().join()).toMatch(/token=;/);
  });

  it('returns 401 for an expired token', async () => {
    // Arrange
    const user = await createUser();
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign({ iat: now - 31 * DAY }, process.env.JWT_SECRET!, {
      subject: user.id,
      expiresIn: SESSION_TTL_SECONDS,
    });

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', tokenCookie(expired));

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 401 and clears the cookie when the user row was deleted', async () => {
    // Arrange
    const user = await createUser();
    const token = signSessionToken(user.id);
    await prisma.user.delete({ where: { id: user.id } });

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', tokenCookie(token));

    // Assert
    expect(response.status).toBe(401);
    expect([response.headers['set-cookie']].flat().join()).toMatch(/token=;/);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie of a signed-in user', async () => {
    // Arrange
    const user = await createUser();

    // Act
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', tokenCookie(signSessionToken(user.id)));

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'success', data: null });
    expect([response.headers['set-cookie']].flat().join()).toMatch(
      /token=;.*Expires=Thu, 01 Jan 1970/,
    );
  });

  it('succeeds without a session — signing out is idempotent', async () => {
    // Act
    const response = await request(app).post('/api/auth/logout');

    // Assert
    expect(response.status).toBe(200);
  });
});

describe('privacy regression (CLAUDE.md §5)', () => {
  it('never stores, returns, or logs the email or real name from the Google token', async () => {
    // Arrange
    acceptToken();

    // Act — sign in, fetch the session, sign out.
    const signIn = await request(app).post('/api/auth/google').send({ credential: 'tok' });
    const cookie = sessionCookieFrom(signIn.headers['set-cookie']);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    // Assert — the database row, every response body, and every log line.
    const rows = await prisma.$queryRawUnsafe<unknown[]>('SELECT * FROM "users"');
    const everything = [
      JSON.stringify(rows),
      JSON.stringify(signIn.body),
      JSON.stringify(me.body),
      JSON.stringify(logout.body),
      ...logLines,
    ].join('\n');

    expect(rows).toHaveLength(1);
    expect(logLines.length).toBeGreaterThan(0);
    expect(everything).not.toContain(LEAK_EMAIL);
    expect(everything).not.toContain(LEAK_NAME);
  });

  it('never logs the token payload when Google rejects a token', async () => {
    // Arrange — google-auth-library embeds the decoded payload in this message.
    verifyIdToken.mockRejectedValue(
      new Error(`Token used too late, 2 > 1: ${JSON.stringify(googlePayload())}`),
    );

    // Act
    await request(app).post('/api/auth/google').send({ credential: 'raw.jwt.value' });

    // Assert
    const logs = logLines.join('\n');
    expect(logs).toContain('expired');
    expect(logs).not.toContain(LEAK_EMAIL);
    expect(logs).not.toContain(LEAK_NAME);
    expect(logs).not.toContain('raw.jwt.value');
  });
});
