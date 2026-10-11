import type { Session } from '../stores/auth';
import { readDeviceValue, removeDeviceValue, writeDeviceValue } from './deviceStorage';

/**
 * The last session the server confirmed, kept on this device so the installed
 * app can open signed in without a connection — docs/features/pwa-offline.md §3.3.
 * Only the public user fields and two flags: no email, no token (the cookie
 * stays HttpOnly). Deleted on sign-out and on every 401.
 */
const SNAPSHOT_KEY = 'bookrough.session';

export function saveSessionSnapshot({ user, needsOnboarding, isAdmin }: Session): void {
  writeDeviceValue(SNAPSHOT_KEY, JSON.stringify({ user, needsOnboarding, isAdmin }));
}

export function clearSessionSnapshot(): void {
  removeDeviceValue(SNAPSHOT_KEY);
}

/** The remembered session, or null — a malformed one is deleted, never trusted. */
export function readSessionSnapshot(): Session | null {
  const raw = readDeviceValue(SNAPSHOT_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed)) {
      return parsed;
    }
  } catch {
    // Falls through to the cleanup below.
  }
  clearSessionSnapshot();
  return null;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { user, needsOnboarding, isAdmin } = value as Record<string, unknown>;
  return (
    typeof user === 'object' &&
    user !== null &&
    typeof (user as Record<string, unknown>).id === 'string' &&
    typeof needsOnboarding === 'boolean' &&
    typeof isAdmin === 'boolean'
  );
}
