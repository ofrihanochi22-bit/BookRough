import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makeSession } from '../test/fixtures';
import { api } from './client';
import { checkDisplayName, updateProfile } from './users';

function respondWith(data: unknown): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: '', headers: new AxiosHeaders(), config };
  };
  api.defaults.adapter = adapter;
  return seen;
}

afterEach(() => {
  delete api.defaults.adapter;
});

describe('users API module', () => {
  it('checkDisplayName sends the name as a query and skips the global toast', async () => {
    // Arrange
    const seen = respondWith({ status: 'success', data: { available: true, reason: null } });

    // Act
    const result = await checkDisplayName('עופרי');

    // Assert
    expect(result).toEqual({ available: true, reason: null });
    expect(seen[0]?.url).toBe('/users/display-name-availability');
    expect(seen[0]?.params).toEqual({ name: 'עופרי' });
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it('updateProfile patches /users/me and unwraps the session', async () => {
    // Arrange
    const session = makeSession();
    const seen = respondWith({ status: 'success', data: session });

    // Act
    const result = await updateProfile({ displayName: 'Ofri', preferredService: 'SPOTIFY' });

    // Assert
    expect(result).toEqual(session);
    expect(seen[0]?.method).toBe('patch');
    expect(JSON.parse(seen[0]?.data as string)).toEqual({
      displayName: 'Ofri',
      preferredService: 'SPOTIFY',
    });
  });
});
