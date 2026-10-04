/**
 * The invite a visitor opened before signing in — docs/features/communities-invites.md
 * §5.4. Kept in sessionStorage so it survives the trip through sign-in and
 * onboarding, but not a closed tab. Storage can be unavailable (private mode,
 * blocked site data); then the user lands on the dashboard and can tap the
 * link again, which is the whole cost of failure.
 */
const KEY = 'pendingInvite';

export function rememberPendingInvite(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable — see above.
  }
}

export function pendingInvite(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    // Only ever an in-app invite path, never somewhere a stored value could send us.
    return path?.startsWith('/invite/') ? path : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
