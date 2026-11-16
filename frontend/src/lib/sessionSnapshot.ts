import type { PublicUser } from '../stores/auth';

/**
 * The saved session (docs/features/client-cache.md §3.3): what the app needs to
 * open signed in at once on a cold launch, while GET /auth/me checks the cookie
 * behind it. The same fields every endpoint already returns through
 * `toPublicUser`; no email exists and the cookie is never readable here.
 */
export const SESSION_STORAGE_KEY = 'bookrough.session.v1';

export interface SessionSnapshot {
  user: PublicUser;
  needsOnboarding: boolean;
  isAdmin: boolean;
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const snapshot = value as Partial<SessionSnapshot>;
  const user = snapshot.user as Partial<PublicUser> | undefined;
  return (
    typeof snapshot.needsOnboarding === 'boolean' &&
    typeof snapshot.isAdmin === 'boolean' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.createdAt === 'string'
  );
}

export function readSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSessionSnapshot({ user, needsOnboarding, isAdmin }: SessionSnapshot): void {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ user, needsOnboarding, isAdmin } satisfies SessionSnapshot),
    );
  } catch {
    // Quota or private mode: the next cold launch waits for /auth/me, as before.
  }
}

export function removeSessionSnapshot(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing more to do.
  }
}
