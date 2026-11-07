import request from 'supertest';

import type * as GoogleIdentityModuleNs from '../services/googleIdentity.service.js';

type GoogleIdentityModule = typeof GoogleIdentityModuleNs;
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import {
  RATE_LIMIT_RULES,
  resetRateLimits,
  setRateLimitsEnabled,
} from '../middleware/rateLimits.js';
import { SECURITY_HEADERS } from '../middleware/securityHeaders.js';
import { resetDatabase } from '../test/db.js';
import { AppError } from '../utils/AppError.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Rate limits and security headers — docs/features/production-hardening.md §8.
 * The limits count every request, refused ones included, so most requests
 * here are cheap 4xx answers: what is under test is the counter, not the
 * endpoint behind it. Google and the converter are mocked (CLAUDE.md §10).
 */
const { verifyGoogleIdToken } = vi.hoisted(() => ({ verifyGoogleIdToken: vi.fn() }));
vi.mock('../services/googleIdentity.service.js', async (importOriginal) => ({
  ...(await importOriginal<GoogleIdentityModule>()),
  verifyGoogleIdToken,
}));
vi.mock('../services/linkScraper.service.js', () => ({
  convertLink: vi.fn(),
  CONVERSION_CEILING_MS: 12_000,
}));

const app = createApp();
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface Person {
  id: string;
  cookie: string;
}

async function person(googleSub: string): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName: googleSub,
      displayNameKey: googleSub,
      preferredService: 'SPOTIFY',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

async function statuses(count: number, send: (index: number) => request.Test): Promise<number[]> {
  const results: number[] = [];
  for (let index = 0; index < count; index += 1) {
    results.push((await send(index)).status);
  }
  return results;
}

const signIn = (target = app) =>
  request(target).post('/api/auth/google').send({ credential: 'junk-token' });

/** The three tier-1 endpoints in turn; each answers 400 or 404 for these bodies. */
const conversion = (who: Person, index: number) => {
  const paths = [
    request(app).post('/api/recommendations').send({}),
    request(app).post(`/api/communities/${UNKNOWN_UUID}/posts`).send({ url: 'x' }),
    request(app).post(`/api/posts/${UNKNOWN_UUID}/conversion`),
  ];
  return paths[index % 3]!.set('Cookie', who.cookie);
};

/** The three tier-3 endpoints in turn. */
const outreach = (who: Person, index: number) => {
  const paths = [
    request(app).post('/api/friends/requests').send({}),
    request(app).post(`/api/communities/${UNKNOWN_UUID}/invitations`).send({}),
    request(app).post('/api/communities').send({}),
  ];
  return paths[index % 3]!.set('Cookie', who.cookie);
};

beforeEach(async () => {
  await resetDatabase();
  resetRateLimits();
  setRateLimitsEnabled(true);
  verifyGoogleIdToken.mockReset();
  verifyGoogleIdToken.mockRejectedValue(
    new AppError('Google sign-in failed. Please try again.', 401),
  );
});

afterAll(async () => {
  setRateLimitsEnabled(false);
  await prisma.$disconnect();
});

describe('tier 1 — conversion', () => {
  it('lets one user make 10 requests across the three endpoints, and refuses the 11th', async () => {
    // Arrange
    const dana = await person('dana');

    // Act
    const first = await statuses(10, (index) => conversion(dana, index));
    const eleventh = await conversion(dana, 10);

    // Assert
    expect(first).not.toContain(429);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual({
      status: 'error',
      code: 429,
      message: RATE_LIMIT_RULES.conversion.message,
    });
    expect(Number(eleventh.headers['retry-after'])).toBeGreaterThan(0);
    expect(eleventh.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it("does not hold one user's limit against another", async () => {
    // Arrange
    const [dana, noam] = await Promise.all([person('dana'), person('noam')]);
    await statuses(11, (index) => conversion(dana, index));

    // Act
    const response = await conversion(noam, 0);

    // Assert
    expect(response.status).not.toBe(429);
  });

  it('answers 401 without a session, and the attempt uses no slot', async () => {
    // Arrange
    const dana = await person('dana');
    const anonymous = await statuses(5, () => request(app).post('/api/recommendations').send({}));

    // Act
    const signedIn = await statuses(10, (index) => conversion(dana, index));

    // Assert
    expect(anonymous).toEqual(Array(5).fill(401));
    expect(signedIn).not.toContain(429);
  });
});

describe('tier 2 — sign-in', () => {
  it('answers 10 attempts normally and refuses the 11th before verifying the token', async () => {
    // Act
    const first = await statuses(10, () => signIn());
    const eleventh = await signIn();

    // Assert
    expect(first).toEqual(Array(10).fill(401));
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.message).toBe(RATE_LIMIT_RULES.signIn.message);
    expect(verifyGoogleIdToken).toHaveBeenCalledTimes(10);
  });

  it('shares the counter with re-choosing the Google photo', async () => {
    // Arrange
    const dana = await person('dana');
    await statuses(10, () => signIn());

    // Act
    const response = await request(app)
      .post('/api/users/me/google-picture')
      .set('Cookie', dana.cookie)
      .send({ credential: 'junk-token' });

    // Assert
    expect(response.status).toBe(429);
  });

  it('counts each client separately behind one trusted proxy', async () => {
    // Arrange — as in production: TRUST_PROXY_HOPS=1
    const proxied = createApp();
    proxied.set('trust proxy', 1);
    const from = (address: string) => signIn(proxied).set('X-Forwarded-For', address);
    await statuses(11, () => from('203.0.113.1'));

    // Act
    const other = await from('203.0.113.2');
    const same = await from('203.0.113.1');

    // Assert
    expect(other.status).toBe(401);
    expect(same.status).toBe(429);
  });

  it('ignores an address a client writes in front of the one the proxy adds', async () => {
    // Arrange
    const proxied = createApp();
    proxied.set('trust proxy', 1);
    await statuses(11, (index) =>
      signIn(proxied).set('X-Forwarded-For', `198.51.100.${index}, 203.0.113.9`),
    );

    // Act
    const spoofed = await signIn(proxied).set('X-Forwarded-For', '198.51.100.200, 203.0.113.9');

    // Assert
    expect(spoofed.status).toBe(429);
  });
});

describe('tier 3 — outreach', () => {
  it('shares 30 an hour across friend requests, invitations and new communities', async () => {
    // Arrange
    const dana = await person('dana');

    // Act
    const first = await statuses(30, (index) => outreach(dana, index));
    const next = await outreach(dana, 30);

    // Assert
    expect(first).not.toContain(429);
    expect(next.status).toBe(429);
    expect(next.body.message).toBe(RATE_LIMIT_RULES.outreach.message);
  });
});

describe('tier 4 — global', () => {
  it('refuses the 301st request in a minute from one address', async () => {
    // Act
    const first = await statuses(300, () => request(app).get('/api/settings'));
    const next = await request(app).get('/api/settings');

    // Assert
    expect(first).not.toContain(429);
    expect(next.status).toBe(429);
    expect(next.body.message).toBe(RATE_LIMIT_RULES.global.message);
  });

  it('never limits /api/health', async () => {
    // Act
    const health = await statuses(305, (index) =>
      request(app).get(index % 2 === 0 ? '/api/health' : '/api/health/'),
    );

    // Assert
    expect(health).toEqual(Array(305).fill(200));
  });
});

describe('switched off', () => {
  it('lets the 11th sign-in through when the limits are disabled', async () => {
    // Arrange
    setRateLimitsEnabled(false);

    // Act
    const all = await statuses(11, () => signIn());

    // Assert
    expect(all).toEqual(Array(11).fill(401));
  });
});

describe('security headers', () => {
  it.each([
    ['a success', '/api/health', 200],
    ['a 404', '/api/nowhere', 404],
    ['a 500', '/api/__boom-raw', 500],
  ])('are on %s, with no X-Powered-By', async (_label, path, status) => {
    // Act
    const response = await request(app).get(path);

    // Assert
    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers[name.toLowerCase()]).toBe(value);
    }
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('are on a 429 too', async () => {
    // Arrange
    await statuses(10, () => signIn());

    // Act
    const response = await signIn();

    // Assert
    expect(response.status).toBe(429);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
