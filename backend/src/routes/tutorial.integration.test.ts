import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { setTutorialEnabled } from '../services/tutorial.service.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * The onboarding tutorial's seen state — docs/features/onboarding-tutorial.md §7.
 * No external boundary is involved: the cookie is minted directly.
 */
const app = createApp();
const ALL_SHOWN = { walkthrough: true, saveTip: true, listTip: true };
const NONE_SHOWN = { walkthrough: false, saveTip: false, listTip: false };

async function signedIn(googleSub: string, onboarded = true) {
  const user = await prisma.user.create({
    data: onboarded
      ? {
          googleSub,
          displayName: googleSub,
          displayNameKey: googleSub,
          preferredService: 'SPOTIFY',
        }
      : { googleSub },
  });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

function markSeen(cookie: string, body: unknown) {
  return request(app)
    .patch('/api/users/me/tutorial')
    .set('Cookie', cookie)
    .send(body as object);
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  setTutorialEnabled(true);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the session carries the tutorial state', () => {
  it('shows everything to an onboarded user who has seen nothing', async () => {
    // Arrange
    const { cookie } = await signedIn('dana');

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.tutorial).toEqual(ALL_SHOWN);
  });

  it('shows nothing while the user is still onboarding', async () => {
    // Arrange
    const { cookie } = await signedIn('new', false);

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(response.body.data.tutorial).toEqual(NONE_SHOWN);
  });

  it('shows nothing when the tutorial is switched off', async () => {
    // Arrange
    const { cookie } = await signedIn('dana');
    setTutorialEnabled(false);

    // Act
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(response.body.data.tutorial).toEqual(NONE_SHOWN);
  });

  it("never appears on another user's profile", async () => {
    // Arrange
    const { cookie } = await signedIn('dana');
    const { user: other } = await signedIn('omer');

    // Act
    const response = await request(app).get(`/api/users/${other.id}`).set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/tutorial|SeenAt/i);
  });
});

describe('PATCH /api/users/me/tutorial', () => {
  it('records the walkthrough; /auth/me then agrees', async () => {
    // Arrange
    const { cookie } = await signedIn('dana');

    // Act
    const response = await markSeen(cookie, { seen: 'walkthrough' });
    const session = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      tutorial: { walkthrough: false, saveTip: true, listTip: true },
    });
    expect(session.body.data.tutorial).toEqual({
      walkthrough: false,
      saveTip: true,
      listTip: true,
    });
  });

  it.each(['saveTip', 'listTip'] as const)('records the %s', async (item) => {
    // Arrange
    const { cookie } = await signedIn('dana');

    // Act
    const response = await markSeen(cookie, { seen: item });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.tutorial[item]).toBe(false);
    expect(response.body.data.tutorial.walkthrough).toBe(true);
  });

  it('is idempotent and keeps the first time', async () => {
    // Arrange
    const { user, cookie } = await signedIn('dana');
    await markSeen(cookie, { seen: 'walkthrough' });
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // Act
    const response = await markSeen(cookie, { seen: 'walkthrough' });
    const second = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // Assert
    expect(response.status).toBe(200);
    expect(second.walkthroughSeenAt).toEqual(first.walkthroughSeenAt);
  });

  it('still records while the tutorial is switched off', async () => {
    // Arrange
    const { user, cookie } = await signedIn('dana');
    setTutorialEnabled(false);

    // Act
    const response = await markSeen(cookie, { seen: 'saveTip' });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.tutorial).toEqual(NONE_SHOWN);
    expect(row.saveTipSeenAt).toBeInstanceOf(Date);
  });

  it('returns 400 for a body that is not JSON', async () => {
    // Arrange
    const { cookie } = await signedIn('dana');

    // Act
    const response = await request(app)
      .patch('/api/users/me/tutorial')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"seen":');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['an empty body', {}],
    ['an unknown item', { seen: 'shareTip' }],
    ['a wrong type', { seen: 1 }],
    ['an extra key', { seen: 'walkthrough', walkthroughSeenAt: null }],
  ])('returns 422 for %s and writes nothing', async (_label, body) => {
    // Arrange
    const { user, cookie } = await signedIn('dana');

    // Act
    const response = await markSeen(cookie, body);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.status).toBe('error');
    expect(row.walkthroughSeenAt).toBeNull();
  });

  it('returns 401 without a session', async () => {
    // Act
    const response = await request(app)
      .patch('/api/users/me/tutorial')
      .send({ seen: 'walkthrough' });

    // Assert
    expect(response.status).toBe(401);
  });
});
