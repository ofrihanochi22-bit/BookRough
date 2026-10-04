import { useEffect } from 'react';
import { isAxiosError } from 'axios';

import type { RequestState } from './useRequest';
import { useAuthStore } from '../stores/auth';

/**
 * A 403 means the role was removed while the screen was open: drop the
 * session's admin flag, so the guard turns the whole area into NotFound and
 * the Profile link disappears.
 */
export function useForbiddenEndsAdmin(state: RequestState<unknown>): boolean {
  const forbidden =
    state.status === 'error' && isAxiosError(state.error) && state.error.response?.status === 403;

  useEffect(() => {
    if (forbidden) {
      useAuthStore.setState({ isAdmin: false });
    }
  }, [forbidden]);

  return forbidden;
}
