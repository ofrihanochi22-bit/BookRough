import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';

import { runQuietly } from '../api/client';
import { cacheSequence, getCached, invalidate, setCached } from '../lib/requestCache';

export type RequestState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

export interface RequestOptions {
  /** Cache key (lib/cacheKeys.ts). Without one the request is never cached. */
  key?: string;
  /** Also keep the answer on the device between visits (client-cache.md §3.2). */
  persist?: boolean;
}

interface Settled<T> {
  load: () => Promise<T>;
  attempt: number;
  state: Exclude<RequestState<T>, { status: 'loading' }>;
}

/**
 * A refresh behind cached data that fails this way means the data is gone for
 * this user (deleted, or they were removed), so the cached copy must not stay.
 */
function isGone(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 403 || status === 404;
}

/**
 * Runs a read request when the screen mounts (and again when `load` changes),
 * exposing the three designed states — loading, ready, error — and a `reload`
 * for the error state's Try again. `load` must be stable: a module-level
 * function or a `useCallback`.
 *
 * "Loading" is derived rather than stored: it is whatever state has not yet
 * settled for the current `load` and attempt, so a stale answer from an older
 * request is never shown.
 *
 * With a `key`, a cached answer is shown at once as `ready` and a fresh one is
 * fetched quietly behind it, replacing it in place (stale-while-revalidate,
 * docs/features/client-cache.md §5.1). A failed refresh keeps the cached data,
 * unless the server says the data is gone (403/404).
 */
export function useRequest<T>(
  load: () => Promise<T>,
  options: RequestOptions = {},
): RequestState<T> & { reload: () => void } {
  const { key, persist = false } = options;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let active = true;
    const startedAt = cacheSequence();
    const cached = key === undefined ? undefined : getCached<T>(key);
    const hadCache = cached !== undefined;
    const request = hadCache ? runQuietly(load) : load();
    request.then(
      (data) => {
        if (key !== undefined) {
          setCached(key, data, persist, startedAt);
        }
        if (active) setSettled({ load, attempt, state: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (hadCache && !isGone(error)) {
          // Keep showing what was cached, settled here so that a later
          // invalidation of the key cannot leave the screen loading with no
          // request in flight.
          if (active) setSettled({ load, attempt, state: { status: 'ready', data: cached } });
          return;
        }
        if (key !== undefined) {
          invalidate([key]);
        }
        if (active) setSettled({ load, attempt, state: { status: 'error', error } });
      },
    );
    return () => {
      active = false;
    };
    // `key` and `persist` follow `load`: a screen builds both from the same ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, attempt]);

  const reload = useCallback(() => {
    if (key !== undefined) {
      invalidate([key]);
    }
    setAttempt((count) => count + 1);
  }, [key]);

  const current = settled && settled.load === load && settled.attempt === attempt;
  if (current) {
    return { ...settled.state, reload };
  }
  const cached = key === undefined ? undefined : getCached<T>(key);
  if (cached !== undefined) {
    return { status: 'ready', data: cached, reload };
  }
  return { status: 'loading', reload };
}
