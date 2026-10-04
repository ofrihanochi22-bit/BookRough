import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import { fetchAdminSettings, fetchPublicSettings, updateAdminSettings } from './settings';

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

describe('settings API module', () => {
  it('fetchPublicSettings gets /settings without the global toast', async () => {
    // Arrange
    const seen = respondWith(ok({ accentColor: 'green', welcomeTagline: 'x' }));

    // Act
    const result = await fetchPublicSettings();

    // Assert
    expect(result).toEqual({ accentColor: 'green', welcomeTagline: 'x' });
    expect(seen[0]).toMatchObject({ method: 'get', url: '/settings', skipErrorToast: true });
  });

  it('fetchAdminSettings gets /admin/settings and unwraps the body', async () => {
    // Arrange
    const body = { settings: { accentColor: 'purple' }, changes: [] };
    const seen = respondWith(ok(body));

    // Act & Assert
    expect(await fetchAdminSettings()).toEqual(body);
    expect(seen[0]).toMatchObject({ method: 'get', url: '/admin/settings', skipErrorToast: true });
  });

  it('updateAdminSettings patches only the given settings', async () => {
    // Arrange
    const seen = respondWith(ok({ settings: {}, changes: [] }));

    // Act
    await updateAdminSettings({ accentColor: 'blue' });

    // Assert
    expect(seen[0]).toMatchObject({
      method: 'patch',
      url: '/admin/settings',
      skipErrorToast: true,
    });
    expect(JSON.parse(seen[0]!.data as string)).toEqual({ accentColor: 'blue' });
  });
});
