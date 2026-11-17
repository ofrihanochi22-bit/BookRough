import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { resetRateLimits, setRateLimitsEnabled } from '../middleware/rateLimits.js';
import { resetDatabase } from '../test/db.js';
import { deploymentsPayload, imagesPayload, usagePayload } from '../test/opsFixtures.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = vi.fn().mockResolvedValue({});
    verifyIdToken = verifyIdToken;
  },
}));

/* docs/features/admin-overview.md §8 — integration: the Overview, both ingest paths, app opens */

const app = createApp();
const TOKEN = 'ci-ingest-token-for-the-test-suite-0123456789';
const EMAIL = 'leak-check@example.com';
const EMAIL_SHAPE = /[^\s"@]+@[^\s"@]+\.[^\s"@]+/;
const mutableEnv = env as { OPS_INGEST_TOKEN: string | undefined };

async function signUp(sub: string) {
  verifyIdToken.mockResolvedValue({
    getPayload: () => ({ sub, picture: 'https://pic/google', email: EMAIL, name: 'Leak Check' }),
  });
  const response = await request(app).post('/api/auth/google').send({ credential: 'tok' });
  const header = [response.headers['set-cookie'] ?? []].flat().find((v) => v.startsWith('token='));
  return header!.split(';')[0]!;
}

async function onboard(cookie: string, displayName: string) {
  await request(app)
    .patch('/api/users/me')
    .set('Cookie', cookie)
    .send({ displayName, preferredService: 'SPOTIFY', useGooglePicture: false });
}

async function adminSession(sub = 'sub-admin', name = 'Boss') {
  const cookie = await signUp(sub);
  await onboard(cookie, name);
  await prisma.user.update({ where: { googleSub: sub }, data: { role: 'ADMIN' } });
  return cookie;
}

async function userSession() {
  const cookie = await signUp('sub-user');
  await onboard(cookie, 'Plain');
  return cookie;
}

function now(minutesAgo = 0): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

beforeEach(async () => {
  await resetDatabase();
  verifyIdToken.mockReset();
  mutableEnv.OPS_INGEST_TOKEN = TOKEN;
});

afterEach(() => {
  mutableEnv.OPS_INGEST_TOKEN = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/admin/overview', () => {
  it('returns the live figures and empty Vercel blocks before any snapshot', async () => {
    // Arrange
    const cookie = await adminSession();
    await userSession();

    // Act
    const response = await request(app).get('/api/admin/overview').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.app.users).toEqual({ total: 2, onboarded: 2 });
    expect(data.app.communities).toBe(0);
    expect(data.database.usedBytes).toBeGreaterThan(0);
    expect(data.database.limitBytes).toBe(1024 * 1024 * 1024);
    expect(data.vercel).toEqual({
      usage: null,
      deployments: null,
      images: null,
      lastDeletion: { deployments: null, images: null },
    });
  });

  it('shows what was posted: the newest snapshot wins, and the last deletion survives a newer run that deleted nothing', async () => {
    // Arrange
    const cookie = await adminSession();
    const post = (source: string, capturedAt: string, payload: unknown) =>
      request(app)
        .post('/api/admin/ops/snapshots')
        .set('Cookie', cookie)
        .send({ source, capturedAt, payload });
    const ci = (capturedAt: string, payload: unknown) =>
      request(app)
        .post('/api/ops/snapshots')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ source: 'PRUNE_DEPLOYMENTS', capturedAt, payload });
    await post('VERCEL_USAGE', now(120), usagePayload({ images: 4e9 }));
    await post('VERCEL_USAGE', now(60), usagePayload({ images: 4.4e9 }));
    await post(
      'IMAGE_CLEANUP',
      now(50),
      imagesPayload({ deleted: [{ tags: [], digest: 'cccccccccccc', sizeBytes: 9 }] }),
    );
    await post('IMAGE_CLEANUP', now(40), imagesPayload());
    await ci(
      now(30),
      deploymentsPayload({ deleted: [{ id: 'dpl_x', sha: null, createdAt: now(3000) }] }),
    );
    await ci(now(20), deploymentsPayload());

    // Act
    const response = await request(app).get('/api/admin/overview').set('Cookie', cookie);

    // Assert
    const { vercel } = response.body.data;
    expect(vercel.usage.storage.images).toMatchObject({
      usedBytes: 4.4e9,
      changeBytes: 4e8,
      status: 'ok',
    });
    expect(vercel.images.items).toHaveLength(2);
    expect(vercel.deployments.items[0]).toMatchObject({
      id: 'dpl_live',
      verdict: 'keep (live)',
      imageSizeBytes: 412_000_000,
    });
    // The deleting runs, not the newer runs that deleted nothing.
    expect(vercel.lastDeletion.images.count).toBe(1);
    expect(vercel.lastDeletion.images.at < vercel.images.capturedAt).toBe(true);
    expect(vercel.lastDeletion.deployments.count).toBe(1);
    expect(vercel.lastDeletion.deployments.at < vercel.deployments.capturedAt).toBe(true);
  });

  it('never names a person: no email, Google sub, display name or user id', async () => {
    // Arrange
    const cookie = await adminSession('sub-admin', 'Boss Name');
    await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });
    const admin = await prisma.user.findUniqueOrThrow({ where: { googleSub: 'sub-admin' } });

    // Act
    const response = await request(app).get('/api/admin/overview').set('Cookie', cookie);

    // Assert
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(EMAIL_SHAPE);
    expect(body).not.toContain('sub-admin');
    expect(body).not.toContain('Boss Name');
    expect(body).not.toContain(admin.id);
  });

  it('is 401 without a session', async () => {
    // Act
    const response = await request(app).get('/api/admin/overview');

    // Assert
    expect(response.status).toBe(401);
  });

  it('is 403 for an ordinary user', async () => {
    // Arrange
    const cookie = await userSession();

    // Act
    const response = await request(app).get('/api/admin/overview').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(403);
  });

  it('is 403 for an admin who has not finished onboarding', async () => {
    // Arrange
    const cookie = await signUp('sub-new-admin');
    await prisma.user.update({ where: { googleSub: 'sub-new-admin' }, data: { role: 'ADMIN' } });

    // Act
    const response = await request(app).get('/api/admin/overview').set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(403);
  });
});

describe('POST /api/admin/ops/snapshots', () => {
  it('stores an admin reading with its writer', async () => {
    // Arrange
    const cookie = await adminSession();

    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });

    // Assert
    expect(response.status).toBe(201);
    const row = await prisma.opsSnapshot.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    const admin = await prisma.user.findUniqueOrThrow({ where: { googleSub: 'sub-admin' } });
    expect(row).toMatchObject({ source: 'VERCEL_USAGE', writtenById: admin.id, deletedCount: 0 });
  });

  it('stores the deletion count of an image run', async () => {
    // Arrange
    const cookie = await adminSession();
    const payload = imagesPayload({
      deleted: [{ tags: ['abc1234abcde'], digest: 'cccccccccccc', sizeBytes: 1 }],
    });

    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send({ source: 'IMAGE_CLEANUP', capturedAt: now(), payload });

    // Assert
    expect(response.status).toBe(201);
    expect((await prisma.opsSnapshot.findFirstOrThrow()).deletedCount).toBe(1);
  });

  it('deletes snapshots received over 90 days ago with the next insert, and keeps newer ones', async () => {
    // Arrange
    const cookie = await adminSession();
    const day = 24 * 60 * 60 * 1000;
    const old = await prisma.opsSnapshot.create({
      data: {
        source: 'VERCEL_USAGE',
        capturedAt: new Date(),
        receivedAt: new Date(Date.now() - 91 * day),
        payload: usagePayload(),
      },
    });
    const recent = await prisma.opsSnapshot.create({
      data: {
        source: 'VERCEL_USAGE',
        capturedAt: new Date(),
        receivedAt: new Date(Date.now() - 89 * day),
        payload: usagePayload(),
      },
    });

    // Act
    await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });

    // Assert
    expect(await prisma.opsSnapshot.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.opsSnapshot.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it.each([
    [
      'PRUNE_DEPLOYMENTS',
      { source: 'PRUNE_DEPLOYMENTS', capturedAt: now(), payload: deploymentsPayload() },
    ],
    ['an unknown source', { source: 'NOPE', capturedAt: now(), payload: {} }],
    ['a bad payload', { source: 'VERCEL_USAGE', capturedAt: now(), payload: { period: null } }],
    [
      'a capturedAt over 7 days old',
      { source: 'VERCEL_USAGE', capturedAt: now(8 * 24 * 60), payload: usagePayload() },
    ],
    [
      'an extra envelope key',
      { source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload(), extra: 1 },
    ],
  ])('is 422 for %s and stores nothing', async (_label, body) => {
    // Arrange
    const cookie = await adminSession();

    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send(body);

    // Assert
    expect(response.status).toBe(422);
    expect(await prisma.opsSnapshot.count()).toBe(0);
  });

  it('is 400 for a body that is not JSON', async () => {
    // Arrange
    const cookie = await adminSession();

    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"source":');

    // Assert
    expect(response.status).toBe(400);
  });

  it('is 401 without a session, even with the CI token', async () => {
    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });

    // Assert
    expect(response.status).toBe(401);
  });

  it('is 403 for an ordinary user', async () => {
    // Arrange
    const cookie = await userSession();

    // Act
    const response = await request(app)
      .post('/api/admin/ops/snapshots')
      .set('Cookie', cookie)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });

    // Assert
    expect(response.status).toBe(403);
    expect(await prisma.opsSnapshot.count()).toBe(0);
  });
});

describe('POST /api/ops/snapshots', () => {
  const body = () => ({
    source: 'PRUNE_DEPLOYMENTS',
    capturedAt: now(),
    payload: deploymentsPayload(),
  });

  it('stores a CI run with the token and no writer', async () => {
    // Act
    const response = await request(app)
      .post('/api/ops/snapshots')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(body());

    // Assert
    expect(response.status).toBe(201);
    expect(await prisma.opsSnapshot.findFirstOrThrow()).toMatchObject({
      source: 'PRUNE_DEPLOYMENTS',
      writtenById: null,
    });
  });

  it.each([
    ['no header', undefined],
    ['the wrong token', 'Bearer not-the-token-not-the-token-not-the-token'],
  ])('is 401 with %s', async (_label, header) => {
    // Act
    const call = request(app).post('/api/ops/snapshots');
    const response = await (header ? call.set('Authorization', header) : call).send(body());

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid ingest token.');
  });

  it('is 401 with an admin cookie and no token: a session is not a key here', async () => {
    // Arrange
    const cookie = await adminSession();

    // Act
    const response = await request(app)
      .post('/api/ops/snapshots')
      .set('Cookie', cookie)
      .send(body());

    // Assert
    expect(response.status).toBe(401);
  });

  it('is 422 for a storage reading sent with the token', async () => {
    // Act
    const response = await request(app)
      .post('/api/ops/snapshots')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ source: 'VERCEL_USAGE', capturedAt: now(), payload: usagePayload() });

    // Assert
    expect(response.status).toBe(422);
    expect(await prisma.opsSnapshot.count()).toBe(0);
  });

  it('is 404 when the server has no token configured', async () => {
    // Arrange
    mutableEnv.OPS_INGEST_TOKEN = undefined;

    // Act
    const response = await request(app)
      .post('/api/ops/snapshots')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(body());

    // Assert
    expect(response.status).toBe(404);
  });

  describe('with rate limits on', () => {
    beforeEach(() => {
      resetRateLimits();
      setRateLimitsEnabled(true);
    });

    afterEach(() => {
      setRateLimitsEnabled(false);
    });

    it('is 429 on the 11th attempt within 15 minutes', async () => {
      // Arrange
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(app)
          .post('/api/ops/snapshots')
          .set('Authorization', 'Bearer wrong')
          .send(body());
      }

      // Act
      const response = await request(app)
        .post('/api/ops/snapshots')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send(body());

      // Assert
      expect(response.status).toBe(429);
    });
  });
});

describe('counting app opens on GET /api/settings', () => {
  async function opensRow() {
    // The count is written after the response; wait for it to land.
    await vi.waitFor(async () => expect(await prisma.dailyAppOpens.count()).toBe(1));
    return prisma.dailyAppOpens.findFirstOrThrow();
  }

  it("counts open=1 signed out, then signed in, on today's row", async () => {
    // Arrange
    const cookie = await userSession();

    // Act
    await request(app).get('/api/settings?open=1');
    await request(app).get('/api/settings?open=1').set('Cookie', cookie);

    // Assert
    await vi.waitFor(async () => {
      const row = await prisma.dailyAppOpens.findFirstOrThrow();
      expect(row).toMatchObject({ signedIn: 1, signedOut: 1 });
    });
    expect((await opensRow()).day.toISOString().slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it.each(['', '?open=0', '?open=yes'])('does not count GET /api/settings%s', async (query) => {
    // Act
    const response = await request(app).get(`/api/settings${query}`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(response.status).toBe(200);
    expect(await prisma.dailyAppOpens.count()).toBe(0);
  });

  it('stores only the day and the two counts', async () => {
    // Act
    await request(app).get('/api/settings?open=1');

    // Assert
    const row = await opensRow();
    expect(Object.keys(row).sort()).toEqual(['day', 'signedIn', 'signedOut']);
  });
});
