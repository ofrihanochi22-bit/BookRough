import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import { listAdminCommunities, listAdminUsers } from './admin';

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

describe('admin API module', () => {
  it('listAdminUsers gets /admin/users without the global toast and unwraps the list', async () => {
    // Arrange
    const seen = respondWith(ok({ users: [{ id: 'u-1' }] }));

    // Act
    const users = await listAdminUsers();

    // Assert
    expect(users).toEqual([{ id: 'u-1' }]);
    expect(seen[0]).toMatchObject({ method: 'get', url: '/admin/users', skipErrorToast: true });
  });

  it('listAdminCommunities gets /admin/communities without the global toast', async () => {
    // Arrange
    const seen = respondWith(ok({ communities: [] }));

    // Act
    const communities = await listAdminCommunities();

    // Assert
    expect(communities).toEqual([]);
    expect(seen[0]).toMatchObject({
      method: 'get',
      url: '/admin/communities',
      skipErrorToast: true,
    });
  });
});
