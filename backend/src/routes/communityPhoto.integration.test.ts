import type { CommunityRole } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Community photo — docs/features/community-photo.md §7. `sharp` is real and
 * every image is generated in the test.
 */
const app = createApp();
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const PHOTO_URL = /^\/api\/communities\/[0-9a-f-]{36}\/photo\?v=\d+$/;

interface Person {
  id: string;
  cookie: string;
}

async function person(name: string, role: 'USER' | 'ADMIN' = 'USER'): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub: `sub-${name}`,
      displayName: name,
      displayNameKey: name.toLowerCase(),
      preferredService: 'SPOTIFY',
      role,
    },
  });
  return { id: user.id, cookie: `token=${signSessionToken(user.id)}` };
}

/** A community with its owner and, optionally, more members by role. */
async function community(owner: Person, others: [Person, CommunityRole][] = []): Promise<string> {
  const created = await prisma.community.create({
    data: {
      name: 'Friday Jazz',
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          ...others.map(([who, role]) => ({ userId: who.id, role })),
        ],
      },
    },
  });
  return created.id;
}

const png = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#a26' } })
    .png()
    .toBuffer();

const upload = (who: Person, id: string, body: Buffer, type = 'image/png') =>
  request(app)
    .put(`/api/communities/${id}/photo`)
    .set('Cookie', who.cookie)
    .set('Content-Type', type)
    .send(body);

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PUT /api/communities/:id/photo', () => {
  it('200: an admin stores a re-encoded WebP, served with the immutable cache header', async () => {
    // Arrange
    const owner = await person('Owner');
    const admin = await person('Admin');
    const id = await community(owner, [[admin, 'ADMIN']]);

    // Act
    const response = await upload(admin, id, await png());

    // Assert
    expect(response.status).toBe(200);
    const url = response.body.data.community.photoUrl as string;
    expect(url).toMatch(PHOTO_URL);
    const image = await request(app).get(url).set('Cookie', owner.cookie);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(await sharp(image.body as Buffer).metadata()).toMatchObject({
      format: 'webp',
      width: 256,
      height: 256,
    });
    const shown = await request(app).get(`/api/communities/${id}`).set('Cookie', owner.cookie);
    expect(shown.body.data.community.photoUrl).toBe(url);
  });

  it('200: replacing the photo changes the ?v= of its URL', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    const first = await upload(owner, id, await png());

    // Act
    const second = await upload(owner, id, await png());

    // Assert
    expect(second.status).toBe(200);
    expect(second.body.data.community.photoUrl).not.toBe(first.body.data.community.photoUrl);
    expect(await prisma.communityPhoto.count()).toBe(1);
  });

  it('413 for an image over 2 MB', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    const big = Buffer.concat([await png(), Buffer.alloc(2 * 1024 * 1024)]);

    // Act
    const response = await upload(owner, id, big);

    // Assert
    expect(response.status).toBe(413);
  });

  it('415 for a type that is not an image', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);

    // Act
    const response = await upload(owner, id, Buffer.from('hello'), 'text/plain');

    // Assert
    expect(response.status).toBe(415);
  });

  it('422 for HTML sent as image/png, storing nothing', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);

    // Act
    const response = await upload(owner, id, Buffer.from('<html><script>x</script></html>'));

    // Assert
    expect(response.status).toBe(422);
    expect(await prisma.communityPhoto.count()).toBe(0);
  });

  it('401 without a session', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);

    // Act
    const response = await request(app)
      .put(`/api/communities/${id}/photo`)
      .set('Content-Type', 'image/png')
      .send(await png());

    // Assert
    expect(response.status).toBe(401);
  });

  it('403 for a member who is not an admin', async () => {
    // Arrange
    const owner = await person('Owner');
    const member = await person('Member');
    const id = await community(owner, [[member, 'MEMBER']]);

    // Act
    const response = await upload(member, id, await png());

    // Assert
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Only admins can change the photo.');
    expect(await prisma.communityPhoto.count()).toBe(0);
  });

  it('404 for a non-member, an unknown community and a malformed id', async () => {
    // Arrange
    const owner = await person('Owner');
    const stranger = await person('Stranger');
    const id = await community(owner);

    // Act
    const responses = await Promise.all([
      upload(stranger, id, await png()),
      upload(owner, UNKNOWN_UUID, await png()),
      upload(owner, 'not-a-uuid', await png()),
    ]);

    // Assert
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
  });
});

describe('DELETE /api/communities/:id/photo', () => {
  it('200: back to the generated cover, and the photo is gone', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    const url = (await upload(owner, id, await png())).body.data.community.photoUrl as string;

    // Act
    const response = await request(app)
      .delete(`/api/communities/${id}/photo`)
      .set('Cookie', owner.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.community.photoUrl).toBeNull();
    const image = await request(app).get(url).set('Cookie', owner.cookie);
    expect(image.status).toBe(404);
  });

  it('200 with no photo (idempotent)', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);

    // Act
    const response = await request(app)
      .delete(`/api/communities/${id}/photo`)
      .set('Cookie', owner.cookie);

    // Assert
    expect(response.status).toBe(200);
  });

  it('403 for a plain member, 401 without a session', async () => {
    // Arrange
    const owner = await person('Owner');
    const member = await person('Member');
    const id = await community(owner, [[member, 'MEMBER']]);
    await upload(owner, id, await png());

    // Act
    const asMember = await request(app)
      .delete(`/api/communities/${id}/photo`)
      .set('Cookie', member.cookie);
    const anonymous = await request(app).delete(`/api/communities/${id}/photo`);

    // Assert
    expect(asMember.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await prisma.communityPhoto.count()).toBe(1);
  });
});

describe('GET /api/communities/:id/photo', () => {
  it('200 for any signed-in user, member or not (D3)', async () => {
    // Arrange
    const owner = await person('Owner');
    const stranger = await person('Stranger');
    const id = await community(owner);
    const url = (await upload(owner, id, await png())).body.data.community.photoUrl as string;

    // Act
    const response = await request(app).get(url).set('Cookie', stranger.cookie);

    // Assert
    expect(response.status).toBe(200);
  });

  it('401 without a session, so a signed-out invite preview falls back', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    await upload(owner, id, await png());

    // Act
    const response = await request(app).get(`/api/communities/${id}/photo`);

    // Assert
    expect(response.status).toBe(401);
  });

  it('404 with no photo and for a malformed id', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);

    // Act
    const none = await request(app).get(`/api/communities/${id}/photo`).set('Cookie', owner.cookie);
    const malformed = await request(app)
      .get('/api/communities/nope/photo')
      .set('Cookie', owner.cookie);

    // Assert
    expect(none.status).toBe(404);
    expect(malformed.status).toBe(404);
  });
});

describe('photoUrl in the lists', () => {
  it("Home's list, the invitations list and the invite preview all carry it", async () => {
    // Arrange
    const owner = await person('Owner');
    const friend = await person('Friend');
    const id = await community(owner);
    const url = (await upload(owner, id, await png())).body.data.community.photoUrl as string;
    await prisma.communityInvitation.create({
      data: { communityId: id, userId: friend.id, invitedById: owner.id },
    });
    await prisma.community.update({ where: { id }, data: { inviteToken: 'photo-token' } });

    // Act
    const home = await request(app).get('/api/communities').set('Cookie', owner.cookie);
    const invitations = await request(app).get('/api/invitations').set('Cookie', friend.cookie);
    const preview = await request(app).get('/api/invites/photo-token');

    // Assert
    expect(home.body.data.communities[0].photoUrl).toBe(url);
    expect(invitations.body.data.invitations[0].community.photoUrl).toBe(url);
    expect(preview.body.data.invite.photoUrl).toBe(url);
  });

  it('deleting the community removes its photo (cascade)', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    await upload(owner, id, await png());

    // Act
    const response = await request(app)
      .delete(`/api/communities/${id}`)
      .set('Cookie', owner.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(await prisma.communityPhoto.count()).toBe(0);
  });
});

describe('DELETE /api/admin/communities/:communityId/photo', () => {
  it('200: the site admin removes it and gets the refreshed row', async () => {
    // Arrange
    const owner = await person('Owner');
    const siteAdmin = await person('Boss', 'ADMIN');
    const id = await community(owner);
    await upload(owner, id, await png());

    // Act
    const response = await request(app)
      .delete(`/api/admin/communities/${id}/photo`)
      .set('Cookie', siteAdmin.cookie);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.data.community).toMatchObject({ id, photoUrl: null, memberCount: 1 });
    expect(await prisma.communityPhoto.count()).toBe(0);
    const row = await prisma.community.findUniqueOrThrow({ where: { id } });
    expect(row.photoUpdatedAt).toBeNull();
  });

  it('403 for a non-admin (even the owner), 401 without a session', async () => {
    // Arrange
    const owner = await person('Owner');
    const id = await community(owner);
    await upload(owner, id, await png());

    // Act
    const asOwner = await request(app)
      .delete(`/api/admin/communities/${id}/photo`)
      .set('Cookie', owner.cookie);
    const anonymous = await request(app).delete(`/api/admin/communities/${id}/photo`);

    // Assert
    expect(asOwner.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await prisma.communityPhoto.count()).toBe(1);
  });

  it('404 for an unknown or malformed community id', async () => {
    // Arrange
    const siteAdmin = await person('Boss', 'ADMIN');

    // Act
    const unknown = await request(app)
      .delete(`/api/admin/communities/${UNKNOWN_UUID}/photo`)
      .set('Cookie', siteAdmin.cookie);
    const malformed = await request(app)
      .delete('/api/admin/communities/nope/photo')
      .set('Cookie', siteAdmin.cookie);

    // Assert
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
  });
});
