import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Avatar upload — docs/features/avatar-upload.md §7. `sharp` is real and every
 * image is generated in the test; Google is mocked for the sign-in check.
 */
const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = vi.fn().mockResolvedValue({});
    verifyIdToken = verifyIdToken;
  },
}));

const app = createApp();
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const UPLOAD_URL = /^\/api\/users\/[0-9a-f-]{36}\/avatar\?v=\d+$/;

interface Person {
  id: string;
  cookie: string;
}

async function person(
  name: string | null,
  extra: { role?: 'USER' | 'ADMIN'; googleSub?: string } = {},
): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub: extra.googleSub ?? `sub-${name ?? 'new'}`,
      displayName: name,
      displayNameKey: name?.toLowerCase() ?? null,
      preferredService: name ? 'SPOTIFY' : null,
      role: extra.role ?? 'USER',
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

const png = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#2a6' } })
    .png()
    .toBuffer();

const upload = (who: Person, body: Buffer, type = 'image/png') =>
  request(app)
    .put('/api/users/me/avatar')
    .set('Cookie', who.cookie)
    .set('Content-Type', type)
    .send(body);

beforeEach(async () => {
  await resetDatabase();
  verifyIdToken.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PUT /api/users/me/avatar', () => {
  it('200: stores a re-encoded WebP and points the profile at it', async () => {
    // Arrange
    const dana = await person('Dana');

    // Act
    const response = await upload(dana, await png());

    // Assert
    expect(response.status).toBe(200);
    const url = response.body.data.user.profilePictureUrl as string;
    expect(url).toMatch(UPLOAD_URL);
    const image = await request(app).get(url).set('Cookie', dana.cookie);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    const meta = await sharp(image.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('413 for an image over 2 MB', async () => {
    // Arrange
    const dana = await person('Dana');
    const big = Buffer.concat([await png(), Buffer.alloc(2 * 1024 * 1024)]);

    // Act
    const response = await upload(dana, big);

    // Assert
    expect(response.status).toBe(413);
  });

  it('415 for a type that is not an image', async () => {
    // Arrange
    const dana = await person('Dana');

    // Act
    const response = await upload(dana, Buffer.from('hello'), 'text/plain');

    // Assert
    expect(response.status).toBe(415);
  });

  it('422 for HTML sent as image/png, and nothing is stored', async () => {
    // Arrange
    const dana = await person('Dana');

    // Act
    const response = await upload(dana, Buffer.from('<html><script>x</script></html>'));

    // Assert
    expect(response.status).toBe(422);
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it('401 without a session, and 403 mid-onboarding', async () => {
    // Arrange
    const newcomer = await person(null);

    // Act
    const anonymous = await request(app)
      .put('/api/users/me/avatar')
      .set('Content-Type', 'image/png')
      .send(await png());
    const onboarding = await upload(newcomer, await png());

    // Assert
    expect(anonymous.status).toBe(401);
    expect(onboarding.status).toBe(403);
  });
});

describe('DELETE /api/users/me/avatar and the switches', () => {
  it('removes the upload: the profile is generated again and the image is gone', async () => {
    // Arrange
    const dana = await person('Dana');
    const url = (await upload(dana, await png())).body.data.user.profilePictureUrl as string;

    // Act
    const response = await request(app).delete('/api/users/me/avatar').set('Cookie', dana.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.user.profilePictureUrl).toBeNull();
    await request(app).get(url).set('Cookie', dana.cookie).expect(404);
  });

  it('Use generated avatar (PATCH /users/me) deletes the upload too', async () => {
    // Arrange
    const dana = await person('Dana');
    await upload(dana, await png());

    // Act
    await request(app)
      .patch('/api/users/me')
      .set('Cookie', dana.cookie)
      .send({ useGooglePicture: false })
      .expect(200);

    // Assert
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it('a sign-in keeps the uploaded photo', async () => {
    // Arrange
    const dana = await person('Dana', { googleSub: 'google-dana' });
    const url = (await upload(dana, await png())).body.data.user.profilePictureUrl as string;
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-dana', picture: 'https://pic/google' }),
    });

    // Act
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok', intent: 'signin' });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.user.profilePictureUrl).toBe(url);
  });
});

describe('GET /api/users/:userId/avatar', () => {
  it('401 without a session; 404 with no photo or a malformed id', async () => {
    // Arrange
    const dana = await person('Dana');

    // Act & Assert
    await request(app).get(`/api/users/${dana.id}/avatar`).expect(401);
    await request(app).get(`/api/users/${dana.id}/avatar`).set('Cookie', dana.cookie).expect(404);
    await request(app).get('/api/users/not-a-uuid/avatar').set('Cookie', dana.cookie).expect(404);
  });
});

describe('DELETE /api/admin/users/:userId/avatar', () => {
  it('200: the admin removes a user photo; the row comes back without it', async () => {
    // Arrange
    const [admin, dana] = await Promise.all([person('Admin', { role: 'ADMIN' }), person('Dana')]);
    await upload(dana, await png());

    // Act
    const response = await request(app)
      .delete(`/api/admin/users/${dana.id}/avatar`)
      .set('Cookie', admin.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: dana.id, profilePictureUrl: null });
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it('403 for a non-admin, 404 for an unknown user, 401 without a session', async () => {
    // Arrange
    const [admin, dana, zed] = await Promise.all([
      person('Admin', { role: 'ADMIN' }),
      person('Dana'),
      person('Zed'),
    ]);
    await upload(dana, await png());

    // Act & Assert
    await request(app)
      .delete(`/api/admin/users/${dana.id}/avatar`)
      .set('Cookie', zed.cookie)
      .expect(403);
    await request(app)
      .delete(`/api/admin/users/${UNKNOWN_UUID}/avatar`)
      .set('Cookie', admin.cookie)
      .expect(404);
    await request(app).delete(`/api/admin/users/${dana.id}/avatar`).expect(401);
    expect(await prisma.userAvatar.count()).toBe(1);
  });
});
