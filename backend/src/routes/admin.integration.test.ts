import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = vi.fn().mockResolvedValue({});
    verifyIdToken = verifyIdToken;
  },
}));

const app = createApp();
const LEAK_EMAIL = 'leak-check@example.com';
const EMAIL_SHAPE = /[^\s"@]+@[^\s"@]+\.[^\s"@]+/;

/** Signs in through the real endpoint, with a Google token that carries an email. */
async function signUp(sub: string, picture = 'https://pic/google') {
  verifyIdToken.mockResolvedValue({
    getPayload: () => ({ sub, picture, email: LEAK_EMAIL, name: 'Leak Check' }),
  });
  const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });
  const header = [response.headers['set-cookie'] ?? []].flat().find((v) => v.startsWith('token='));
  return { body: response.body, cookie: header!.split(';')[0]! };
}

async function onboard(cookie: string, displayName: string, useGooglePicture = false) {
  return request(app)
    .patch('/api/users/me')
    .set('Cookie', cookie)
    .send({ displayName, preferredService: 'SPOTIFY', useGooglePicture });
}

async function makeAdmin(sub: string) {
  await prisma.user.update({ where: { googleSub: sub }, data: { role: 'ADMIN' } });
}

/** An onboarded admin, signed in. */
async function adminSession() {
  const { cookie } = await signUp('sub-admin');
  await onboard(cookie, 'Boss');
  await makeAdmin('sub-admin');
  return cookie;
}

beforeEach(async () => {
  await resetDatabase();
  verifyIdToken.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the session carries isAdmin', () => {
  it('is false for an ordinary user on sign-in, /auth/me and profile saves', async () => {
    // Act
    const { body, cookie } = await signUp('sub-plain');
    const saved = await onboard(cookie, 'Plain');
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Assert
    expect(body.data.isAdmin).toBe(false);
    expect(saved.body.data.isAdmin).toBe(false);
    expect(me.body.data.isAdmin).toBe(false);
  });

  it('is true for an onboarded admin, and only once onboarding is done', async () => {
    // Arrange — the role is set before onboarding.
    const { cookie } = await signUp('sub-admin');
    await makeAdmin('sub-admin');
    const before = await request(app).get('/api/auth/me').set('Cookie', cookie);

    // Act
    const saved = await onboard(cookie, 'Boss');
    const after = await signUp('sub-admin');

    // Assert
    expect(before.body.data.isAdmin).toBe(false);
    expect(saved.body.data.isAdmin).toBe(true);
    expect(after.body.data.isAdmin).toBe(true);
  });
});

describe('GET /api/admin/users', () => {
  it('lists every user newest first, with community counts', async () => {
    // Arrange
    const cookie = await adminSession();
    const mia = await signUp('sub-mia');
    await onboard(mia.cookie, 'Mia', true);
    await request(app).post('/api/communities').set('Cookie', mia.cookie).send({ name: 'Jazz' });
    await signUp('sub-pending');

    // Act
    const response = await request(app).get('/api/admin/users').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    const users = response.body.data.users;
    expect(users.map((u: { displayName: string | null }) => u.displayName)).toEqual([
      null,
      'Mia',
      'Boss',
    ]);
    expect(users[0]).toMatchObject({
      onboarded: false,
      profilePictureUrl: null,
      communityCount: 0,
    });
    expect(users[1]).toMatchObject({
      onboarded: true,
      isAdmin: false,
      profilePictureUrl: 'https://pic/google',
      preferredService: 'SPOTIFY',
      communityCount: 1,
    });
    expect(users[2]).toMatchObject({ isAdmin: true, profilePictureUrl: null });
  });
});

describe('GET /api/admin/communities', () => {
  it('lists every community newest first, with member counts and owners', async () => {
    // Arrange
    const cookie = await adminSession();
    const mia = await signUp('sub-mia');
    await onboard(mia.cookie, 'Mia');
    await request(app).post('/api/communities').set('Cookie', mia.cookie).send({ name: 'First' });
    await request(app)
      .post('/api/communities')
      .set('Cookie', cookie)
      .send({ name: 'Second', description: 'private words' });

    // Act
    const response = await request(app).get('/api/admin/communities').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.communities).toEqual([
      expect.objectContaining({
        name: 'Second',
        memberCount: 1,
        owner: expect.objectContaining({ displayName: 'Boss' }),
      }),
      expect.objectContaining({
        name: 'First',
        memberCount: 1,
        owner: expect.objectContaining({ displayName: 'Mia' }),
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain('private words');
  });

  it('returns an empty list when there are no communities', async () => {
    // Arrange
    const cookie = await adminSession();

    // Act
    const response = await request(app).get('/api/admin/communities').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.communities).toEqual([]);
  });
});

describe.each(['/api/admin/users', '/api/admin/communities'])('refusals on %s', (path) => {
  it('returns 401 without a session', async () => {
    // Act
    const response = await request(app).get(path);

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 403 for an ordinary user', async () => {
    // Arrange
    const { cookie } = await signUp('sub-plain');
    await onboard(cookie, 'Plain');

    // Act
    const response = await request(app).get(path).set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 'error',
      code: 403,
      message: "You don't have access to this.",
    });
  });

  it('returns 403 for an admin who has not finished onboarding', async () => {
    // Arrange
    const { cookie } = await signUp('sub-admin');
    await makeAdmin('sub-admin');

    // Act
    const response = await request(app).get(path).set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(403);
  });

  it('returns 403 on the very next request once the role is removed', async () => {
    // Arrange
    const cookie = await adminSession();
    const allowed = await request(app).get(path).set('Cookie', cookie);
    await prisma.user.update({ where: { googleSub: 'sub-admin' }, data: { role: 'USER' } });

    // Act
    const response = await request(app).get(path).set('Cookie', cookie);

    // Assert
    expect(allowed.status).toBe(200);
    expect(response.status).toBe(403);
  });
});

it('returns 404 for an unknown admin path, even for an admin', async () => {
  // Arrange
  const cookie = await adminSession();

  // Act
  const response = await request(app).get('/api/admin/nothing').set('Cookie', cookie);

  // Assert
  expect(response.status).toBe(404);
});

describe('privacy (CLAUDE.md §5)', () => {
  it('no admin response contains an email, a Google sub, or a display-name key', async () => {
    // Arrange
    const cookie = await adminSession();
    const mia = await signUp('sub-mia');
    await onboard(mia.cookie, 'Mia');
    await request(app).post('/api/communities').set('Cookie', mia.cookie).send({ name: 'Jazz' });
    const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: 'sub-mia' } });

    // Act
    const users = await request(app).get('/api/admin/users').set('Cookie', cookie);
    const communities = await request(app).get('/api/admin/communities').set('Cookie', cookie);

    // Assert
    const everything = JSON.stringify(users.body) + JSON.stringify(communities.body);
    expect(users.status).toBe(200);
    expect(everything).not.toMatch(EMAIL_SHAPE);
    expect(everything).not.toContain('sub-mia');
    expect(everything).not.toContain('sub-admin');
    expect(everything).not.toContain(user.displayNameKey!);
    expect(everything).not.toContain('googleSub');
    expect(everything).not.toContain('displayNameKey');
  });

  it('never shows a Google photo kept only to be offered during onboarding', async () => {
    // Arrange
    const cookie = await adminSession();
    await signUp('sub-pending', 'https://pic/not-chosen');

    // Act
    const response = await request(app).get('/api/admin/users').set('Cookie', cookie);

    // Assert
    expect(JSON.stringify(response.body)).not.toContain('https://pic/not-chosen');
  });
});
