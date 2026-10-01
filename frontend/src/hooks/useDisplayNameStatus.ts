import { useEffect, useState } from 'react';

import { checkDisplayName } from '../api/users';
import { cleanDisplayName, displayNameProblem } from '../lib/displayName';

export type DisplayNameStatus =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'reserved' }
  /** The check itself failed (offline, server error); the save re-checks. */
  | { kind: 'unknown' };

type ServerAnswer = Extract<
  DisplayNameStatus,
  { kind: 'available' | 'taken' | 'reserved' | 'unknown' }
>;

export const CHECK_DELAY_MS = 400;

/**
 * Local rules are derived on every render, with no request. A name that passes
 * them is checked by the server after a short pause in typing; a newer
 * keystroke aborts the older request, and an answer only counts for the exact
 * name it was asked about, so a slow reply never overwrites a fresher one.
 */
export function useDisplayNameStatus(raw: string): DisplayNameStatus {
  const name = cleanDisplayName(raw);
  const problem = name.length === 0 ? null : displayNameProblem(name);
  const needsCheck = name.length > 0 && problem === null;
  const [answer, setAnswer] = useState<{ name: string; status: ServerAnswer } | null>(null);

  useEffect(() => {
    if (!needsCheck) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      checkDisplayName(name, controller.signal)
        .then((result) => {
          setAnswer({
            name,
            status: result.available ? { kind: 'available' } : { kind: result.reason },
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAnswer({ name, status: { kind: 'unknown' } });
          }
        });
    }, CHECK_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, needsCheck]);

  if (name.length === 0) {
    return { kind: 'empty' };
  }
  if (problem) {
    return { kind: 'invalid', message: problem };
  }
  return answer?.name === name ? answer.status : { kind: 'checking' };
}
