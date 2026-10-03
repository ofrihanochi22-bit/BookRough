import { useCallback, useEffect, useState } from 'react';

export type RequestState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

interface Settled<T> {
  load: () => Promise<T>;
  attempt: number;
  state: Exclude<RequestState<T>, { status: 'loading' }>;
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
 */
export function useRequest<T>(load: () => Promise<T>): RequestState<T> & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (active) setSettled({ load, attempt, state: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (active) setSettled({ load, attempt, state: { status: 'error', error } });
      },
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const current = settled && settled.load === load && settled.attempt === attempt;
  return { ...(current ? settled.state : { status: 'loading' }), reload };
}
