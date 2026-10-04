import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

// --- Log capture: the logger is silent in tests, so this suite swaps in one
// that records every line, to prove a token never reaches a log. ---
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

const INVALID =
  'This invite link is invalid or has expired. Please request a new link from the Community Admin.';
const PREVIEW_KEYS = ['alreadyMember', 'communityId', 'memberCount', 'name'];

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

/** Ofri creates "Friday Jazz" and takes its invite link; Dana is a stranger. */
async function communityWithInvite() {
  const ofri = await onboardedUser('sub-ofri', 'Ofri');
  const dana = await onboardedUser('sub-dana', 'Dana');
  const created = await request(app)
    .post('/api/communities')
    .set('Cookie', ofri.cookie)
    .send({ name: 'Friday Jazz', description: 'Members-only rules' });
  const communityId = created.body.data.community.id as string;
  const invite = await request(app)
    .get(`/api/communities/${communityId}/invite`)
    .set('Cookie', ofri.cookie);
  return { ofri, dana, communityId, token: invite.body.data.invite.token as string };
}

async function joinAs(cookie: string, token: string) {
  return request(app).post(`/api/invites/${token}/accept`).set('Cookie', cookie);
}

beforeEach(async () => {
  await resetDatabase();
  logLines.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/communities/:id/invite', () => {
  it('creates the token on first request and returns the same one afterwards', async () => {
    // Arrange
    const { ofri, communityId, token } = await communityWithInvite();

    // Act
    const again = await request(app)
      .get(`/api/communities/${communityId}/invite`)
      .set('Cookie', ofri.cookie);

    // Assert
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(again.status).toBe(200);
    expect(again.body.data.invite.token).toBe(token);
    const row = await prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    expect(row.inviteToken).toBe(token);
  });

  it('returns 403 to a plain member and creates nothing', async () => {
    // Arrange
    const { dana, communityId, token } = await communityWithInvite();
    await joinAs(dana.cookie, token);

    // Act
    const response = await request(app)
      .get(`/api/communities/${communityId}/invite`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Only admins can invite people.');
  });

  it('returns 404 to a non-member, for an unknown id and for a malformed id', async () => {
    // Arrange
    const { dana, communityId } = await communityWithInvite();

    // Act
    const responses = await Promise.all(
      [communityId, '00000000-0000-4000-8000-000000000000', 'not-a-uuid'].map((id) =>
        request(app).get(`/api/communities/${id}/invite`).set('Cookie', dana.cookie),
      ),
    );

    // Assert
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
  });

  it('returns 401 without a session', async () => {
    // Arrange
    const { communityId } = await communityWithInvite();

    // Act & Assert
    expect((await request(app).get(`/api/communities/${communityId}/invite`)).status).toBe(401);
  });
});

describe('POST /api/communities/:id/invite/reset', () => {
  it('replaces the token; the old link stops working at once', async () => {
    // Arrange
    const { ofri, communityId, token } = await communityWithInvite();

    // Act
    const response = await request(app)
      .post(`/api/communities/${communityId}/invite/reset`)
      .set('Cookie', ofri.cookie);

    // Assert
    expect(response.status).toBe(200);
    const fresh = response.body.data.invite.token as string;
    expect(fresh).not.toBe(token);
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/invites/${fresh}`)).status).toBe(200);
  });

  it('returns 403 to a member, 404 to a non-member, 401 without a session', async () => {
    // Arrange
    const { dana, communityId, token } = await communityWithInvite();
    const stranger = await onboardedUser('sub-stranger', 'Stranger');
    await joinAs(dana.cookie, token);
    const path = `/api/communities/${communityId}/invite/reset`;

    // Act
    const member = await request(app).post(path).set('Cookie', dana.cookie);
    const outsider = await request(app).post(path).set('Cookie', stranger.cookie);
    const anonymous = await request(app).post(path);

    // Assert
    expect([member.status, outsider.status, anonymous.status]).toEqual([403, 404, 401]);
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(200);
  });
});

describe('GET /api/invites/:token', () => {
  it('previews the community to a signed-out visitor, with exactly the public fields', async () => {
    // Arrange
    const { communityId, token } = await communityWithInvite();

    // Act
    const response = await request(app).get(`/api/invites/${token}`);

    // Assert
    expect(response.status).toBe(200);
    const preview = response.body.data.invite;
    expect(Object.keys(preview).sort()).toEqual(PREVIEW_KEYS);
    expect(preview).toEqual({
      communityId,
      name: 'Friday Jazz',
      memberCount: 1,
      alreadyMember: false,
    });
  });

  it('tells a signed-in member they are already in, and a signed-in stranger they are not', async () => {
    // Arrange
    const { ofri, dana, token } = await communityWithInvite();

    // Act
    const member = await request(app).get(`/api/invites/${token}`).set('Cookie', ofri.cookie);
    const stranger = await request(app).get(`/api/invites/${token}`).set('Cookie', dana.cookie);

    // Assert
    expect(member.body.data.invite.alreadyMember).toBe(true);
    expect(stranger.body.data.invite.alreadyMember).toBe(false);
  });

  it('treats a broken session cookie as signed out rather than failing', async () => {
    // Arrange
    const { token } = await communityWithInvite();

    // Act
    const response = await request(app)
      .get(`/api/invites/${token}`)
      .set('Cookie', 'token=not-a-jwt');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.invite.alreadyMember).toBe(false);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['an unknown token', 'AAAAAAAAAAAAAAAAAAAAAA'],
    ['a malformed token', '%25%25%25'],
    ['a 65-character token', 'x'.repeat(65)],
  ])('returns the UC-15 404 for %s', async (_case, token) => {
    // Act
    const response = await request(app).get(`/api/invites/${token}`);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(INVALID);
  });
});

describe('POST /api/invites/:token/accept', () => {
  it('joins as MEMBER; the community now has two members', async () => {
    // Arrange
    const { dana, communityId, token } = await communityWithInvite();

    // Act
    const response = await joinAs(dana.cookie, token);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.joined).toBe(true);
    expect(response.body.data.community).toMatchObject({
      id: communityId,
      memberCount: 2,
      myRole: 'MEMBER',
    });
    const row = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: dana.user.id, communityId } },
    });
    expect(row?.role).toBe('MEMBER');
  });

  it('is idempotent: joining again changes nothing, and the owner stays OWNER', async () => {
    // Arrange
    const { ofri, dana, communityId, token } = await communityWithInvite();
    await joinAs(dana.cookie, token);

    // Act
    const again = await joinAs(dana.cookie, token);
    const admin = await joinAs(ofri.cookie, token);

    // Assert
    expect(again.status).toBe(200);
    expect(again.body.data.joined).toBe(false);
    expect(admin.body.data.joined).toBe(false);
    expect(admin.body.data.community.myRole).toBe('OWNER');
    expect(await prisma.communityMember.count({ where: { communityId } })).toBe(2);
  });

  it('returns 401 without a session and 403 to a user who has not finished onboarding', async () => {
    // Arrange
    const { communityId, token } = await communityWithInvite();
    const unfinished = await unfinishedUser();

    // Act
    const anonymous = await request(app).post(`/api/invites/${token}/accept`);
    const notOnboarded = await joinAs(unfinished.cookie, token);

    // Assert
    expect([anonymous.status, notOnboarded.status]).toEqual([401, 403]);
    expect(await prisma.communityMember.count({ where: { communityId } })).toBe(1);
  });

  it('returns the UC-15 404 for an unknown, a malformed, and a reset token', async () => {
    // Arrange
    const { ofri, dana, communityId, token } = await communityWithInvite();
    await request(app)
      .post(`/api/communities/${communityId}/invite/reset`)
      .set('Cookie', ofri.cookie);

    // Act
    const responses = await Promise.all(
      [token, 'AAAAAAAAAAAAAAAAAAAAAA', '%25%25%25'].map((value) => joinAs(dana.cookie, value)),
    );

    // Assert
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(responses[0]!.body.message).toBe(INVALID);
  });
});

describe('the invite token stays secret', () => {
  it('appears in no community response, no preview, no accept body, and no log line', async () => {
    // Arrange
    const { ofri, dana, communityId, token } = await communityWithInvite();

    // Act
    const bodies = [
      await request(app).get(`/api/invites/${token}`),
      await joinAs(dana.cookie, token),
      await request(app).get(`/api/communities/${communityId}`).set('Cookie', ofri.cookie),
      await request(app).get('/api/communities').set('Cookie', ofri.cookie),
      // A rejected token goes through the error handler, which logs the path.
      await request(app).get(`/api/invites/${token}x`),
    ].map((response) => JSON.stringify(response.body));

    // Assert
    for (const body of bodies) {
      expect(body).not.toContain(token);
    }
    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.join('\n')).not.toContain(token);
    expect(logLines.join('\n')).toContain('/api/invites/:token');
  });
});
