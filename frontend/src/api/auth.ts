import type { Session } from '../stores/auth';
import { api, type SuccessBody } from './client';

/**
 * Exchanges a Google ID token for a session cookie. Errors are shown inline on
 * Welcome, so the global toast is skipped for this one call.
 */
export async function signInWithGoogle(credential: string): Promise<Session> {
  const response = await api.post<SuccessBody<Session>>(
    '/auth/google',
    { credential },
    { skipErrorToast: true },
  );
  return response.data.data;
}

/** Resolves the current session. A 401 means "signed out", not an error to show. */
export async function fetchSession(): Promise<Session> {
  const response = await api.get<SuccessBody<Session>>('/auth/me', { skipErrorToast: true });
  return response.data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
