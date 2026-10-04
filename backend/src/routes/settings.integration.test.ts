import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

// --- Log capture, for the "keys, never the texts" check. ---
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
const DEFAULT_TAGLINE = 'Share music with friends, on whatever app they use.';

async function makeUser(sub: string, displayName: string, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await prisma.user.create({
    data: {
      googleSub: sub,
      displayName,
      displayNameKey: displayName.toLowerCase(),
      preferredService: 'SPOTIFY',
      role,
    },
  });
  return { user, cookie: `token=${signSessionToken(user.id)}` };
}

const adminUser = () => makeUser('sub-admin', 'Boss', 'ADMIN');

function patch(cookie: string, body: unknown) {
  return request(app)
    .patch('/api/admin/settings')
    .set('Cookie', cookie)
    .send(body as object);
}

async function tableCounts() {
  return {
    settings: await prisma.appSetting.count(),
    changes: await prisma.settingChange.count(),
  };
}

beforeEach(async () => {
  await resetDatabase();
  logLines.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/settings', () => {
  it('serves the defaults when nothing was ever saved', async () => {
    // Act
    const response = await request(app).get('/api/settings');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ accentColor: 'purple', welcomeTagline: DEFAULT_TAGLINE });
  });

  it('gives the banner to signed-in callers only, and null when it is off', async () => {
    // Arrange
    const { cookie: admin } = await adminUser();
    const { cookie: friend } = await makeUser('sub-friend', 'Mia');
    await patch(admin, { announcement: { enabled: true, text: 'Party tonight' } });

    // Act
    const signedOut = await request(app).get('/api/settings');
    const signedIn = await request(app).get('/api/settings').set('Cookie', friend);
    await patch(admin, { announcement: { enabled: false, text: 'Party tonight' } });
    const turnedOff = await request(app).get('/api/settings').set('Cookie', friend);

    // Assert
    expect(signedOut.body.data).not.toHaveProperty('announcement');
    expect(JSON.stringify(signedOut.body)).not.toContain('Party tonight');
    expect(signedIn.body.data.announcement).toEqual({ text: 'Party tonight' });
    expect(turnedOff.body.data.announcement).toBeNull();
  });
});

describe('PATCH /api/admin/settings', () => {
  it('changes a setting, stores it, and records who changed it from what', async () => {
    // Arrange
    const { user, cookie } = await adminUser();

    // Act
    const response = await patch(cookie, { accentColor: 'green' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.settings.accentColor).toBe('green');
    expect(response.body.data.changes).toEqual([
      expect.objectContaining({
        key: 'accentColor',
        oldValue: 'purple',
        newValue: 'green',
        changedBy: { id: user.id, displayName: 'Boss' },
      }),
    ]);
    const row = await prisma.appSetting.findUniqueOrThrow({ where: { key: 'ACCENT_COLOR' } });
    expect(row.value).toBe('green');
    const read = await request(app).get('/api/admin/settings').set('Cookie', cookie);
    expect(read.body.data.settings.accentColor).toBe('green');
    expect(read.body.data.changes).toHaveLength(1);
  });

  it('writes one history row per setting changed, and none for a no-op', async () => {
    // Arrange
    const { cookie } = await adminUser();

    // Act
    await patch(cookie, { accentColor: 'blue', welcomeTagline: 'Friends and music.' });
    await patch(cookie, { accentColor: 'blue' });

    // Assert
    expect(await tableCounts()).toEqual({ settings: 2, changes: 2 });
  });

  it('stores the cleaned text', async () => {
    // Arrange
    const { cookie } = await adminUser();

    // Act
    const response = await patch(cookie, { welcomeTagline: '   Friends   and music.  ' });

    // Assert
    expect(response.body.data.settings.welcomeTagline).toBe('Friends and music.');
  });

  it('returns only the last 20 changes, newest first', async () => {
    // Arrange
    const { cookie } = await adminUser();
    for (let i = 1; i <= 21; i += 1) {
      await patch(cookie, { welcomeTagline: `Tagline ${i}` });
    }

    // Act
    const response = await request(app).get('/api/admin/settings').set('Cookie', cookie);

    // Assert
    const { changes } = response.body.data;
    expect(changes).toHaveLength(20);
    expect(changes[0].newValue).toBe('Tagline 21');
    expect(changes[19].newValue).toBe('Tagline 2');
  });

  it('keeps the history after the admin account is deleted, with no author', async () => {
    // Arrange
    const { user, cookie } = await adminUser();
    await patch(cookie, { accentColor: 'pink' });
    await prisma.user.delete({ where: { id: user.id } });
    const { cookie: other } = await makeUser('sub-admin-2', 'Second', 'ADMIN');

    // Act
    const response = await request(app).get('/api/admin/settings').set('Cookie', other);

    // Assert
    expect(response.body.data.changes).toEqual([
      expect.objectContaining({ key: 'accentColor', changedBy: null }),
    ]);
  });

  it('logs the changed keys but never the texts', async () => {
    // Arrange
    const { cookie } = await adminUser();

    // Act
    await patch(cookie, { announcement: { enabled: true, text: 'Secret surprise party' } });

    // Assert
    const logs = logLines.join('\n');
    expect(logs).toContain('ANNOUNCEMENT');
    expect(logs).not.toContain('Secret surprise party');
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    // Arrange
    const { cookie } = await adminUser();

    // Act
    const response = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"accentColor":');

    // Assert
    expect(response.status).toBe(400);
  });

  it.each([
    ['an empty body', {}],
    ['an unknown key', { theme: 'dark' }],
    ['a wrong type', { accentColor: 7 }],
    [
      'an announcement with an extra key',
      { announcement: { enabled: true, text: 'Hi', html: '<b>' } },
    ],
    ['a colour outside the palette', { accentColor: '#ff0000' }],
    [
      'banner text over 140 characters',
      { announcement: { enabled: false, text: 'x'.repeat(141) } },
    ],
    ['a banner turned on with no text', { announcement: { enabled: true, text: ' ' } }],
    ['an empty tagline', { welcomeTagline: '   ' }],
    ['a tagline over 80 characters', { welcomeTagline: 'y'.repeat(81) }],
    ['one bad value among good ones', { accentColor: 'green', welcomeTagline: '' }],
  ])('returns 422 for %s and leaves the tables untouched', async (_label, body) => {
    // Arrange
    const { cookie } = await adminUser();

    // Act
    const response = await patch(cookie, body);

    // Assert
    expect(response.status).toBe(422);
    expect(await tableCounts()).toEqual({ settings: 0, changes: 0 });
  });
});

describe.each([
  ['GET', () => request(app).get('/api/admin/settings')],
  ['PATCH', () => request(app).patch('/api/admin/settings').send({ accentColor: 'green' })],
])('%s /api/admin/settings refusals', (_method, call) => {
  it('returns 401 without a session', async () => {
    // Act
    const response = await call();

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 403 for an ordinary user, and changes nothing', async () => {
    // Arrange
    const { cookie } = await makeUser('sub-friend', 'Mia');

    // Act
    const response = await call().set('Cookie', cookie);

    // Assert
    expect(response.status).toBe(403);
    expect(await tableCounts()).toEqual({ settings: 0, changes: 0 });
  });
});
