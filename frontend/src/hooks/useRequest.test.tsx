import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cacheSequence, getCached, invalidate, setCached } from '../lib/requestCache';
import { useRequest } from './useRequest';

/** A promise and the handles to settle it from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', AxiosError.ERR_BAD_RESPONSE, config, null, {
    data: {},
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  });
}

function cache(key: string, data: unknown): void {
  setCached(key, data, false, cacheSequence());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRequest without a key (unchanged behaviour)', () => {
  it('starts loading, then is ready with the answer', async () => {
    // Arrange
    const load = vi.fn(() => Promise.resolve('data'));

    // Act
    const { result } = renderHook(() => useRequest(load));

    // Assert
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: 'data' }));
  });

  it('shows the error state when the request fails', async () => {
    // Arrange
    const load = vi.fn(() => Promise.reject(new Error('down')));

    // Act
    const { result } = renderHook(() => useRequest(load));

    // Assert
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('useRequest with a key (client-cache.md §5.1)', () => {
  it('fills the cache when nothing was cached', async () => {
    // Arrange
    const load = vi.fn(() => Promise.resolve(['fresh']));

    // Act
    const { result } = renderHook(() => useRequest(load, { key: 'communities' }));

    // Assert
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getCached('communities')).toEqual(['fresh']);
  });

  it('shows cached data on the first render, with no loading state', () => {
    // Arrange
    cache('communities', ['cached']);
    const load = vi.fn(() => new Promise<string[]>(() => {}));

    // Act
    const { result } = renderHook(() => useRequest(load, { key: 'communities' }));

    // Assert
    expect(result.current).toMatchObject({ status: 'ready', data: ['cached'] });
  });

  it('refreshes behind cached data and replaces it in place', async () => {
    // Arrange
    cache('communities', ['cached']);
    const answer = deferred<string[]>();
    const load = vi.fn(() => answer.promise);
    const { result } = renderHook(() => useRequest(load, { key: 'communities' }));

    // Act
    await act(async () => answer.resolve(['fresh']));

    // Assert
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'ready', data: ['fresh'] });
    expect(getCached('communities')).toEqual(['fresh']);
  });

  it('keeps the cached data when the refresh fails without a response', async () => {
    // Arrange
    cache('communities', ['cached']);
    const answer = deferred<string[]>();
    const load = () => answer.promise;
    const { result } = renderHook(() => useRequest(load, { key: 'communities' }));

    // Act
    await act(async () => answer.reject(new AxiosError('Network Error')));

    // Assert
    expect(result.current).toMatchObject({ status: 'ready', data: ['cached'] });
    expect(getCached('communities')).toEqual(['cached']);
  });

  it('stays ready after a failed refresh even if the key is then invalidated', async () => {
    // Arrange
    cache('feed:c1', ['cached']);
    const answer = deferred<string[]>();
    const load = () => answer.promise;
    const { result, rerender } = renderHook(() => useRequest(load, { key: 'feed:c1' }));
    await act(async () => answer.reject(httpError(503)));

    // Act
    invalidate(['feed']);
    rerender();

    // Assert
    expect(result.current).toMatchObject({ status: 'ready', data: ['cached'] });
  });

  it('shows the error state and drops the key when the refresh says the data is gone', async () => {
    // Arrange
    cache('post:p1', { id: 'p1' });
    const answer = deferred<unknown>();
    const load = () => answer.promise;
    const { result } = renderHook(() => useRequest(load, { key: 'post:p1' }));

    // Act
    await act(async () => answer.reject(httpError(404)));

    // Assert
    expect(result.current.status).toBe('error');
    expect(getCached('post:p1')).toBeUndefined();
  });

  it('treats a 403 refresh (removed from the community) as gone too', async () => {
    // Arrange
    cache('feed:c1', ['cached']);
    const answer = deferred<unknown>();
    const load = () => answer.promise;
    const { result } = renderHook(() => useRequest(load, { key: 'feed:c1' }));

    // Act
    await act(async () => answer.reject(httpError(403)));

    // Assert
    expect(result.current.status).toBe('error');
    expect(getCached('feed:c1')).toBeUndefined();
  });

  it('shows the error state when nothing was cached and the request fails', async () => {
    // Arrange
    const load = () => Promise.reject(httpError(500));

    // Act
    const { result } = renderHook(() => useRequest(load, { key: 'communities' }));

    // Assert
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('reload drops the key and shows loading, never the cached copy', async () => {
    // Arrange
    cache('myList', ['cached']);
    const load = vi.fn(() => new Promise<string[]>(() => {}));
    const { result } = renderHook(() => useRequest(load, { key: 'myList' }));

    // Act
    act(() => result.current.reload());

    // Assert
    expect(result.current.status).toBe('loading');
    expect(getCached('myList')).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never shows or caches an old answer under a new key', async () => {
    // Arrange
    const first = deferred<string>();
    const second = deferred<string>();
    const loadA = () => first.promise;
    const loadB = () => second.promise;
    const { result, rerender } = renderHook(({ load, key }) => useRequest(load, { key }), {
      initialProps: { load: loadA, key: 'feed:a' },
    });

    // Act
    rerender({ load: loadB, key: 'feed:b' });
    await act(async () => first.resolve('answer for a'));

    // Assert
    expect(result.current.status).toBe('loading');
    expect(getCached('feed:b')).toBeUndefined();
    expect(getCached('feed:a')).toBe('answer for a');
  });
});
