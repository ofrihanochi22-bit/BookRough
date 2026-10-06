import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { displayNameKey } from '../services/displayName.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * Friend requests — docs/features/friend-requests.md §7. The converter is
 * mocked (CLAUDE.md §10), though nothing here converts a link.
 */
const { convertLink } = vi.hoisted(() => ({ convertLink: vi.fn() }));
vi.mock('../services/linkScraper.service.js', () => ({ convertLink }));

const app = createApp();

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const SENDER_GONE = 'This request is no longer valid as the user account does not exist.';
const REQUEST_GONE = 'This request is no longer available.';

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

const send = (from: Person, to: string) =>
  request(app).post('/api/friends/requests').set('Cookie', from.cookie).send({ userId: to });
const cancel = (from: Person, to: string) =>
  request(app).delete(`/api/friends/requests/sent/${to}`).set('Cookie', from.cookie);
const accept = (who: Person, sender: string) =>
  request(app).post(`/api/friends/requests/${sender}/accept`).set('Cookie', who.cookie);
const ignore = (who: Person, sender: string) =>
  request(app).post(`/api/friends/requests/${sender}/ignore`).set('Cookie', who.cookie);
const friendsOf = (who: Person) => request(app).get('/api/friends').set('Cookie', who.cookie);
const requestsOf = (who: Person) =>
  request(app).get('/api/friends/requests').set('Cookie', who.cookie);
const countOf = async (who: Person) =>
  (await request(app).get('/api/friends/requests/count').set('Cookie', who.cookie)).body.data
    .count as number;
const relation = async (viewer: Person, target: Person) =>
  (await request(app).get(`/api/users/${target.id}`).set('Cookie', viewer.cookie)).body.data
    .friendship as string;

const asMember = (p: Person) => ({ id: p.id, displayName: p.name, profilePictureUrl: null });

beforeEach(async () => {
  await resetDatabase();
  convertLink.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the friend-request lifecycle', () => {
  it('send → the badge and the list → accept → both are friends', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    const sent = await send(ofri, dana.id);

    // Assert: pending on both sides.
    expect(sent.status).toBe(200);
    expect(sent.body.data).toEqual({ friendship: 'REQUEST_SENT' });
    expect(await countOf(dana)).toBe(1);
    const incoming = await requestsOf(dana);
    expect(incoming.body.data.requests).toEqual([
      { user: asMember(ofri), since: expect.any(String) },
    ]);
    expect(await relation(ofri, dana)).toBe('REQUEST_SENT');
    expect(await relation(dana, ofri)).toBe('REQUEST_RECEIVED');
    expect(await countOf(ofri)).toBe(0);

    // Act
    const accepted = await accept(dana, ofri.id);

    // Assert: friends both ways, nothing pending.
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.friend).toEqual({ user: asMember(ofri), since: expect.any(String) });
    expect((await friendsOf(dana)).body.data.friends).toEqual([
      { user: asMember(ofri), since: expect.any(String) },
    ]);
    expect((await friendsOf(ofri)).body.data.friends).toEqual([
      { user: asMember(dana), since: expect.any(String) },
    ]);
    expect(await relation(ofri, dana)).toBe('FRIENDS');
    expect(await relation(dana, ofri)).toBe('FRIENDS');
    expect(await countOf(dana)).toBe(0);
  });

  it('send is idempotent, and sending to a friend changes nothing', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    await send(ofri, dana.id);
    const again = await send(ofri, dana.id);
    await accept(dana, ofri.id);
    const toFriend = await send(ofri, dana.id);

    // Assert
    expect(again.body.data.friendship).toBe('REQUEST_SENT');
    expect(toFriend.body.data.friendship).toBe('FRIENDS');
    expect(await prisma.friend.count()).toBe(1);
  });

  it('ignore deletes the request; the sender sees NONE and may send again', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await send(ofri, dana.id);

    // Act
    const ignored = await ignore(dana, ofri.id);
    const twice = await ignore(dana, ofri.id);

    // Assert
    expect(ignored.status).toBe(200);
    expect(twice.status).toBe(200);
    expect((await requestsOf(dana)).body.data.requests).toEqual([]);
    expect(await relation(ofri, dana)).toBe('NONE');
    expect((await send(ofri, dana.id)).body.data.friendship).toBe('REQUEST_SENT');
    expect(await countOf(dana)).toBe(1);
  });

  it('cancel withdraws your own request, idempotently', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await send(ofri, dana.id);

    // Act
    const cancelled = await cancel(ofri, dana.id);
    const twice = await cancel(ofri, dana.id);

    // Assert
    expect(cancelled.body.data).toEqual({ friendship: 'NONE' });
    expect(twice.status).toBe(200);
    expect(await countOf(dana)).toBe(0);
  });

  it("cancel and ignore cannot touch someone else's request or a friendship", async () => {
    // Arrange: Dana → Ofri pending; Ofri and Yael are friends.
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    const yael = await person('sub-yael', 'Yael');
    await send(dana, ofri.id);
    await send(yael, ofri.id);
    await accept(ofri, yael.id);

    // Act: Ofri "cancels" Dana's request to him; Yael "ignores" Ofri; Ofri cancels Yael.
    await cancel(ofri, dana.id);
    await ignore(yael, ofri.id);
    await cancel(ofri, yael.id);

    // Assert
    expect(await relation(ofri, dana)).toBe('REQUEST_RECEIVED');
    expect(await relation(ofri, yael)).toBe('FRIENDS');
  });

  it('sending to someone who asked you makes you friends, in one row', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await send(ofri, dana.id);

    // Act
    const back = await send(dana, ofri.id);

    // Assert
    expect(back.body.data.friendship).toBe('FRIENDS');
    expect(await relation(ofri, dana)).toBe('FRIENDS');
    expect(await prisma.friend.count()).toBe(1);
  });

  it('two opposite requests at once end as one friendship', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    const [a, b] = await Promise.all([send(ofri, dana.id), send(dana, ofri.id)]);

    // Assert: one of them sent, the other accepted it.
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.data.friendship, b.body.data.friendship]).toContain('FRIENDS');
    expect(await prisma.friend.count()).toBe(1);
    expect(await relation(ofri, dana)).toBe('FRIENDS');
  });

  it('lists friends alphabetically and only your own', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const yael = await person('sub-yael', 'Yael');
    const ada = await person('sub-ada', 'Ada');
    const zed = await person('sub-zed', 'Zed');
    await send(yael, ofri.id);
    await accept(ofri, yael.id);
    await send(ofri, ada.id);
    await accept(ada, ofri.id);
    await send(zed, yael.id);
    await accept(yael, zed.id);

    // Act
    const friends = await friendsOf(ofri);

    // Assert
    expect(
      friends.body.data.friends.map((f: { user: { displayName: string } }) => f.user.displayName),
    ).toEqual(['Ada', 'Yael']);
  });
});

describe('the database guards', () => {
  it('refuses a reverse-direction row and a row to yourself', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await prisma.friend.create({ data: { requesterId: ofri.id, addresseeId: dana.id } });

    // Act
    const reverse = prisma.friend.create({ data: { requesterId: dana.id, addresseeId: ofri.id } });
    const self = prisma.friend.create({ data: { requesterId: ofri.id, addresseeId: ofri.id } });

    // Assert
    await expect(reverse).rejects.toMatchObject({ code: 'P2002' });
    await expect(self).rejects.toThrow(/friends_not_self/);
  });
});

describe('the ghost request (UC-7)', () => {
  it("deleting the sender removes the request; Accept gets UC-7's message", async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await send(dana, ofri.id);

    // Act
    await prisma.user.delete({ where: { id: dana.id } });
    const response = await accept(ofri, dana.id);

    // Assert
    expect(await countOf(ofri)).toBe(0);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(SENDER_GONE);
  });

  it('Accept with no pending request is 404 "no longer available"', async () => {
    // Arrange: Dana exists but sent nothing; Ofri's own outgoing request is not acceptable by him.
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');
    await send(ofri, dana.id);

    // Act
    const response = await accept(ofri, dana.id);

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.message).toBe(REQUEST_GONE);
    expect(await relation(ofri, dana)).toBe('REQUEST_SENT');
  });
});

describe('bad requests', () => {
  it('422: no userId, a malformed one, an unknown key, or yourself', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const post = (body: object) =>
      request(app).post('/api/friends/requests').set('Cookie', ofri.cookie).send(body);

    // Act
    const responses = await Promise.all([
      post({}),
      post({ userId: 'nope' }),
      post({ userId: UNKNOWN_UUID, extra: 1 }),
      post({ userId: ofri.id }),
    ]);

    // Assert
    expect(responses.map((r) => r.status)).toEqual([422, 422, 422, 422]);
    expect(responses[3]!.body.message).toBe("You can't add yourself.");
  });

  it('404: send to an unknown or mid-onboarding user; cancel and ignore with a malformed id', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const pending = await person('sub-pending', null);

    // Act
    const unknown = await send(ofri, UNKNOWN_UUID);
    const onboarding = await send(ofri, pending.id);
    const badCancel = await cancel(ofri, 'nope');
    const badIgnore = await ignore(ofri, 'nope');
    const badAccept = await accept(ofri, 'nope');

    // Assert
    for (const response of [unknown, onboarding, badCancel, badIgnore]) {
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found.');
    }
    expect(badAccept.status).toBe(404);
    expect(badAccept.body.message).toBe(SENDER_GONE);
  });

  it('401 on every endpoint signed out; 403 for a caller mid-onboarding', async () => {
    // Arrange
    const pending = await person('sub-pending', null);
    const calls = [
      () => request(app).get('/api/friends'),
      () => request(app).get('/api/friends/requests'),
      () => request(app).get('/api/friends/requests/count'),
      () => request(app).post('/api/friends/requests').send({ userId: UNKNOWN_UUID }),
      () => request(app).delete(`/api/friends/requests/sent/${UNKNOWN_UUID}`),
      () => request(app).post(`/api/friends/requests/${UNKNOWN_UUID}/accept`),
      () => request(app).post(`/api/friends/requests/${UNKNOWN_UUID}/ignore`),
    ];

    // Act
    const signedOut = await Promise.all(calls.map((call) => call()));
    const onboarding = await Promise.all(calls.map((call) => call().set('Cookie', pending.cookie)));

    // Assert
    expect(signedOut.map((r) => r.status)).toEqual(calls.map(() => 401));
    expect(onboarding.map((r) => r.status)).toEqual(calls.map(() => 403));
  });
});

describe('response shapes', () => {
  it('the profile adds only the viewer’s friendship', async () => {
    // Arrange
    const ofri = await person('sub-ofri', 'Ofri');
    const dana = await person('sub-dana', 'Dana Levi');

    // Act
    const response = await request(app).get(`/api/users/${dana.id}`).set('Cookie', ofri.cookie);
    const own = await request(app).get(`/api/users/${ofri.id}`).set('Cookie', ofri.cookie);

    // Assert
    expect(Object.keys(response.body.data).sort()).toEqual(['friendship', 'user']);
    expect(response.body.data.friendship).toBe('NONE');
    expect(own.body.data.friendship).toBe('NONE');
  });
});
