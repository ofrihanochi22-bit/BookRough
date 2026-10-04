import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makeCommunity } from '../test/fixtures';
import { api } from './client';
import { createCommunity, getCommunity, listMyCommunities } from './communities';

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

afterEach(() => {
  delete api.defaults.adapter;
});

describe('communities API module', () => {
  it('createCommunity posts the body and unwraps the community', async () => {
    // Arrange
    const community = makeCommunity();
    const seen = respondWith(ok({ community }));

    // Act
    const result = await createCommunity({ name: 'Friday Jazz', description: null });

    // Assert
    expect(result).toEqual(community);
    expect(seen[0]).toMatchObject({ method: 'post', url: '/communities', skipErrorToast: true });
    expect(JSON.parse(seen[0]!.data as string)).toEqual({ name: 'Friday Jazz', description: null });
  });

  it('listMyCommunities unwraps the list', async () => {
    // Arrange
    const seen = respondWith(ok({ communities: [makeCommunity()] }));

    // Act & Assert
    expect(await listMyCommunities()).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'get', url: '/communities', skipErrorToast: true });
  });

  it('getCommunity encodes the id into the path', async () => {
    // Arrange
    const seen = respondWith(ok({ community: makeCommunity() }));

    // Act
    await getCommunity('a/b');

    // Assert
    expect(seen[0]?.url).toBe('/communities/a%2Fb');
  });
});
