import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { makeSession } from '../test/fixtures';
import { fetchSession, logout, signInWithGoogle } from './auth';
import { api } from './client';

/** Records the request and answers 200 with the given body. */
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

describe('auth API module', () => {
  it('signInWithGoogle posts the credential and unwraps the session, skipping the global toast', async () => {
    // Arrange
    const session = makeSession();
    const seen = respondWith({ status: 'success', data: session });

    // Act
    const result = await signInWithGoogle('id-token');

    // Assert
    expect(result).toEqual(session);
    expect(seen[0]?.url).toBe('/auth/google');
    expect(JSON.parse(seen[0]?.data as string)).toEqual({ credential: 'id-token' });
    expect(seen[0]?.skipErrorToast).toBe(true);
  });

  it('fetchSession reads /auth/me', async () => {
    // Arrange
    const session = makeSession();
    const seen = respondWith({ status: 'success', data: session });

    // Act
    const result = await fetchSession();

    // Assert
    expect(result).toEqual(session);
    expect(seen[0]?.url).toBe('/auth/me');
  });

  it('logout posts to /auth/logout', async () => {
    // Arrange
    const seen = respondWith({ status: 'success', data: null });

    // Act
    await logout();

    // Assert
    expect(seen[0]?.method).toBe('post');
    expect(seen[0]?.url).toBe('/auth/logout');
  });
});
