import type { Session } from '../stores/auth';
import { api, type SuccessBody } from './client';

/** Sign in to an existing account, or create one (docs/features/sign-in-sign-up.md §4). */
export type SignInIntent = 'signin' | 'signup';

/** The session, plus whether this call created the account. */
export type SignInResult = Session & { created: boolean };

/**
 * Exchanges a Google ID token for a session cookie. Errors are shown inline on
 * Welcome, so the global toast is skipped for this one call. `signin` without an
 * account is a 404 and creates nothing.
 */
export async function signInWithGoogle(
  credential: string,
  intent: SignInIntent,
): Promise<SignInResult> {
  const response = await api.post<SuccessBody<SignInResult>>(
    '/auth/google',
    { credential, intent },
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
