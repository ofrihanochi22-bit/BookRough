import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { displayNameKey } from '../services/displayName.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Invite friends to a community — docs/features/invite-friends.md §7. The
 * converter is mocked (CLAUDE.md §10), though nothing here converts a link.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({ convertLink }));

const app = createApp();

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const GONE = 'This invitation is no longer available.';

interface Person {
  id: string;
  name: string;
  cookie: string;
}

async function person(googleSub: string, displayName: string | null): Promise<Person> {
  const user = await prisma.user.create({
    data: {
      googleSub,
      displayName,
      displayNameKey: displayName === null ? null : displayNameKey(displayName),
      preferredService: displayName === null ? null : 'TIDAL',
    },
  });
  return { id: user.id, name: displayName ?? '', cookie: `token=${signSessionToken(user.id)}` };
}

const befriend = (a: Person, b: Person) =>
  prisma.friend.create({ data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED' } });

/** Ofri owns "Crew"; Ada is a plain member. */
async function crew() {
  const ofri = await person('sub-ofri', 'Ofri');
  const ada = await person('sub-ada', 'Ada');
  const community = await prisma.community.create({
    data: {
      name: 'Crew',
      members: { create: [{ userId: ofri.id, role: 'OWNER' }, { userId: ada.id }] },
    },
  });
  return { ofri, ada, id: community.id };
}

const candidates = (who: Person, id: string) =>
  request(app).get(`/api/communities/${id}/invitations/candidates`).set('Cookie', who.cookie);
const invite = (who: Person, id: string, userIds: string[]) =>
  request(app)
    .post(`/api/communities/${id}/invitations`)
    .set('Cookie', who.cookie)
    .send({ userIds });
const cancel = (who: Person, id: string, userId: string) =>
  request(app).delete(`/api/communities/${id}/invitations/${userId}`).set('Cookie', who.cookie);
const mine = (who: Person) => request(app).get('/api/invitations').set('Cookie', who.cookie);
const countOf = async (who: Person) =>
  (await request(app).get('/api/invitations/count').set('Cookie', who.cookie)).body.data
    .count as number;
const accept = (who: Person, id: string) =>
  request(app).post(`/api/invitations/${id}/accept`).set('Cookie', who.cookie);
const decline = (who: Person, id: string) =>
  request(app).post(`/api/invitations/${id}/decline`).set('Cookie', who.cookie);
const isMember = async (who: Person, id: string) =>
  (await prisma.communityMember.count({ where: { userId: who.id, communityId: id } })) === 1;
const statusOf = async (who: Person, id: string, friend: Person) =>
  (
    (await candidates(who, id)).body.data.candidates as Array<{
      user: { id: string };
      status: string;
    }>
  ).find((candidate) => candidate.user.id === friend.id)?.status;

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the invitation lifecycle', () => {
  it('admin invites a friend → the count and the list → Join → a member, invitation gone', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await befriend(dana, ofri);

    // Act
    const sent = await invite(ofri, id, [dana.id]);

    // Assert
    expect(sent.status).toBe(200);
    expect(sent.body.data.candidates).toEqual([
      { user: { id: dana.id, displayName: 'Dana', profilePictureUrl: null }, status: 'INVITED' },
    ]);
    expect(await countOf(dana)).toBe(1);
    expect((await mine(dana)).body.data.invitations).toEqual([
      {
        community: { id, name: 'Crew', memberCount: 2 },
        invitedBy: { id: ofri.id, displayName: 'Ofri', profilePictureUrl: null },
        sentAt: expect.any(String),
      },
    ]);

    // Act
    const joined = await accept(dana, id);

    // Assert
    expect(joined.status).toBe(200);
    expect(joined.body.data).toEqual({ community: { id } });
    expect(await isMember(dana, id)).toBe(true);
    expect(await countOf(dana)).toBe(0);
    expect(await statusOf(ofri, id, dana)).toBe('MEMBER');
    const role = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: dana.id, communityId: id } },
    });
    expect(role?.role).toBe('MEMBER');
  });

  it('decline: gone for both; the admin can invite again', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await befriend(ofri, dana);
    await invite(ofri, id, [dana.id]);

    // Act
    const declined = await decline(dana, id);
    const twice = await decline(dana, id);

    // Assert
    expect([declined.status, twice.status]).toEqual([200, 200]);
    expect(await countOf(dana)).toBe(0);
    expect(await statusOf(ofri, id, dana)).toBe('INVITABLE');
    expect(await isMember(dana, id)).toBe(false);
  });

  it('cancel by the admin removes it from the invitee', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await befriend(ofri, dana);
    await invite(ofri, id, [dana.id]);

    // Act
    const cancelled = await cancel(ofri, id, dana.id);

    // Assert
    expect(cancelled.body.data.candidates[0].status).toBe('INVITABLE');
    expect((await mine(dana)).body.data.invitations).toEqual([]);
  });

  it('skips a non-friend, a member, a blocked friend and one already invited', async () => {
    // Arrange: Ada is a member and a friend; Bea is blocked; Cai is invited; Zed is no friend.
    const { ofri, ada, id } = await crew();
    const [bea, cai, zed] = await Promise.all([
      person('sub-bea', 'Bea'),
      person('sub-cai', 'Cai'),
      person('sub-zed', 'Zed'),
    ]);
    await Promise.all([befriend(ofri, ada), befriend(ofri, bea), befriend(ofri, cai)]);
    await prisma.communityBan.create({
      data: { communityId: id, userId: bea.id, bannedById: ofri.id },
    });
    await invite(ofri, id, [cai.id]);

    // Act
    const response = await invite(ofri, id, [ada.id, bea.id, cai.id, zed.id]);

    // Assert
    expect(response.status).toBe(200);
    expect(
      response.body.data.candidates.map((c: { user: { displayName: string }; status: string }) => [
        c.user.displayName,
        c.status,
      ]),
    ).toEqual([
      ['Ada', 'MEMBER'],
      ['Bea', 'BLOCKED'],
      ['Cai', 'INVITED'],
    ]);
    expect(await prisma.communityInvitation.count()).toBe(1);
  });
});

describe('other paths clear an invitation', () => {
  it('joining by the link deletes the pending invitation', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await befriend(ofri, dana);
    await invite(ofri, id, [dana.id]);
    const link = await request(app).get(`/api/communities/${id}/invite`).set('Cookie', ofri.cookie);

    // Act
    await request(app)
      .post(`/api/invites/${link.body.data.invite.token}/accept`)
      .set('Cookie', dana.cookie);

    // Assert
    expect(await isMember(dana, id)).toBe(true);
    expect(await countOf(dana)).toBe(0);
  });

  it('removal deletes a pending invitation (invited, joined by link, removed)', async () => {
    // Arrange: the invitation is re-created directly after the link join, as a stale row.
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await prisma.communityMember.create({ data: { userId: dana.id, communityId: id } });
    await prisma.communityInvitation.create({
      data: { communityId: id, userId: dana.id, invitedById: ofri.id },
    });

    // Act
    const removed = await request(app)
      .delete(`/api/communities/${id}/members/${dana.id}`)
      .set('Cookie', ofri.cookie);

    // Assert
    expect(removed.status).toBe(200);
    expect(await countOf(dana)).toBe(0);
  });

  it('a block added after the invitation wins at Join, unannounced', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await befriend(ofri, dana);
    await invite(ofri, id, [dana.id]);
    await prisma.communityBan.create({
      data: { communityId: id, userId: dana.id, bannedById: ofri.id },
    });

    // Act
    const response = await accept(dana, id);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(GONE);
    expect(await isMember(dana, id)).toBe(false);
    expect(await countOf(dana)).toBe(0);
  });

  it("the inviter's account deleted: the invitation stays, without a name", async () => {
    // Arrange: Ada is promoted and invites; then her account goes.
    const { ofri, ada, id } = await crew();
    const dana = await person('sub-dana', 'Dana');
    await prisma.communityMember.update({
      where: { userId_communityId: { userId: ada.id, communityId: id } },
      data: { role: 'ADMIN' },
    });
    await befriend(ada, dana);
    await invite(ada, id, [dana.id]);

    // Act
    await prisma.user.delete({ where: { id: ada.id } });

    // Assert
    const invitations = (await mine(dana)).body.data.invitations;
    expect(invitations).toHaveLength(1);
    expect(invitations[0].invitedBy).toBeNull();
    expect((await accept(dana, id)).status).toBe(200);
    expect(ofri.id).toBeDefined();
  });

  it('accept with no invitation is 404, and nobody joins', async () => {
    // Arrange
    const { id } = await crew();
    const dana = await person('sub-dana', 'Dana');

    // Act
    const response = await accept(dana, id);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(GONE);
    expect(await isMember(dana, id)).toBe(false);
  });
});

describe('bad requests and permissions', () => {
  it('422: empty, 51 ids, a malformed id, an unknown key', async () => {
    // Arrange
    const { ofri, id } = await crew();
    const post = (body: object) =>
      request(app).post(`/api/communities/${id}/invitations`).set('Cookie', ofri.cookie).send(body);
    const many = Array.from({ length: 51 }, () => UNKNOWN_UUID);

    // Act
    const responses = await Promise.all([
      post({ userIds: [] }),
      post({ userIds: many }),
      post({ userIds: ['nope'] }),
      post({ userIds: [UNKNOWN_UUID], note: 'hi' }),
    ]);

    // Assert
    expect(responses.map((r) => r.status)).toEqual([422, 422, 422, 422]);
  });

  it('403 for a plain member; 404 for a non-member; 401 signed out; 403 mid-onboarding', async () => {
    // Arrange
    const { ada, id } = await crew();
    const zed = await person('sub-zed', 'Zed');
    const pending = await person('sub-pending', null);

    // Act
    const member = await candidates(ada, id);
    const outsider = await candidates(zed, id);
    const signedOut = await request(app).get(`/api/communities/${id}/invitations/candidates`);
    const onboarding = await request(app).get('/api/invitations').set('Cookie', pending.cookie);
    const memberInvites = await invite(ada, id, [zed.id]);
    const memberCancels = await cancel(ada, id, zed.id);

    // Assert
    expect(member.status).toBe(403);
    expect(member.body.message).toBe('Only admins can invite people.');
    expect(outsider.status).toBe(404);
    expect(signedOut.status).toBe(401);
    expect(onboarding.status).toBe(403);
    expect([memberInvites.status, memberCancels.status]).toEqual([403, 403]);
  });

  it('404 for malformed ids on cancel, accept and decline; 401 on the invitee endpoints', async () => {
    // Arrange
    const { ofri, id } = await crew();

    // Act
    const badCancel = await cancel(ofri, id, 'nope');
    const badAccept = await accept(ofri, 'nope');
    const badDecline = await decline(ofri, 'nope');
    const signedOut = await Promise.all([
      request(app).get('/api/invitations'),
      request(app).get('/api/invitations/count'),
      request(app).post(`/api/invitations/${id}/accept`),
      request(app).post(`/api/invitations/${id}/decline`),
    ]);

    // Assert
    expect([badCancel.status, badAccept.status, badDecline.status]).toEqual([404, 404, 404]);
    expect(badAccept.body.message).toBe(GONE);
    expect(signedOut.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });
});
