import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import { getProfile, listProfileRatings, searchUsers } from './profiles';

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
const USER_ID = 'b1d7c2e4-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

afterEach(() => {
  delete api.defaults.adapter;
});

describe('profiles API module', () => {
  it('searchUsers GETs the search with q, quietly, and returns the results', async () => {
    // Arrange
    const results = { users: [], hasMore: false };
    const seen = respondWith(ok(results));

    // Act
    const data = await searchUsers('Dana Levi');

    // Assert
    expect(data).toEqual(results);
    expect(seen[0]).toMatchObject({
      method: 'get',
      url: '/users/search',
      params: { q: 'Dana Levi' },
      skipErrorToast: true,
    });
  });

  it("getProfile GETs the user with the viewer's friendship", async () => {
    // Arrange
    const user = {
      id: USER_ID,
      displayName: 'Dana',
      profilePictureUrl: null,
      preferredService: 'TIDAL',
    };
    const seen = respondWith(ok({ user, friendship: 'REQUEST_SENT' }));

    // Act
    const data = await getProfile(USER_ID);

    // Assert
    expect(data).toEqual({ user, friendship: 'REQUEST_SENT' });
    expect(seen[0]).toMatchObject({ url: `/users/${USER_ID}`, skipErrorToast: true });
  });

  it('listProfileRatings sends the cursor only when there is one', async () => {
    // Arrange
    const seen = respondWith(ok({ items: [], nextCursor: null }));

    // Act
    await listProfileRatings(USER_ID);
    await listProfileRatings(USER_ID, 'cursor-1');

    // Assert
    expect(seen[0]).toMatchObject({ url: `/users/${USER_ID}/ratings` });
    expect(seen[0]!.params).toBeUndefined();
    expect(seen[1]).toMatchObject({ params: { before: 'cursor-1' }, skipErrorToast: true });
  });
});
