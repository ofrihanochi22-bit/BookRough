import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  countFriendRequests,
  ignoreFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriend,
  sendFriendRequest,
} from './friends';

function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

const ok = (data: unknown) => ({ status: 'success', data });
const ID = 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FRIEND = { user: { id: ID, displayName: 'Dana', profilePictureUrl: null }, since: 'x' };

afterEach(() => {
  delete api.defaults.adapter;
});

describe('friends API module', () => {
  it('sendFriendRequest POSTs the user id, quietly, and returns the friendship', async () => {
    // Arrange
    const seen = respondWith(ok({ friendship: 'REQUEST_SENT' }));

    // Act
    const friendship = await sendFriendRequest(ID);

    // Assert
    expect(friendship).toBe('REQUEST_SENT');
    expect(seen[0]).toMatchObject({
      method: 'post',
      url: '/friends/requests',
      skipErrorToast: true,
    });
    expect(JSON.parse(seen[0]!.data as string)).toEqual({ userId: ID });
  });

  it('cancelFriendRequest DELETEs the sent request', async () => {
    // Arrange
    const seen = respondWith(ok({ friendship: 'NONE' }));

    // Act & Assert
    await expect(cancelFriendRequest(ID)).resolves.toBe('NONE');
    expect(seen[0]).toMatchObject({ method: 'delete', url: `/friends/requests/sent/${ID}` });
  });

  it('acceptFriendRequest and ignoreFriendRequest POST to the sender', async () => {
    // Arrange
    const seen = respondWith(ok({ friend: FRIEND }));

    // Act
    const friend = await acceptFriendRequest(ID);
    await ignoreFriendRequest(ID);

    // Assert
    expect(friend).toEqual(FRIEND);
    expect(seen.map((config) => config.url)).toEqual([
      `/friends/requests/${ID}/accept`,
      `/friends/requests/${ID}/ignore`,
    ]);
    expect(seen.every((config) => config.skipErrorToast)).toBe(true);
  });

  it('removeFriend DELETEs the friendship and returns the relation', async () => {
    // Arrange
    const seen = respondWith(ok({ friendship: 'NONE' }));

    // Act & Assert
    await expect(removeFriend(ID)).resolves.toBe('NONE');
    expect(seen[0]).toMatchObject({
      method: 'delete',
      url: `/friends/${ID}`,
      skipErrorToast: true,
    });
  });

  it('the lists and the count unwrap their payloads', async () => {
    // Arrange
    respondWith(ok({ friends: [FRIEND], requests: [FRIEND], count: 2 }));

    // Act & Assert
    await expect(listFriends()).resolves.toEqual([FRIEND]);
    await expect(listFriendRequests()).resolves.toEqual([FRIEND]);
    await expect(countFriendRequests()).resolves.toBe(2);
  });
});
