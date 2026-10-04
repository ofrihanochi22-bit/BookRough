import { useState } from 'react';

import { logout } from '../api/auth';
import { clearPendingInvite } from '../lib/pendingInvite';
import { useAuthStore } from '../stores/auth';

/**
 * Signs out, then clears the session; the route guards take it from there.
 * If the request fails the interceptor has already shown a toast, and the local
 * session is kept — the cookie may still be valid, so pretending otherwise
 * would be a lie.
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      // A pending invite belongs to whoever opened it; signing out on purpose drops it.
      // (Not in the store's clear(): that also runs for the signed-out visitor's
      // first 401, after the invite preview has already remembered the link.)
      clearPendingInvite();
      useAuthStore.getState().clear();
    } catch {
      setSigningOut(false);
    }
  }

  return { signingOut, signOut };
}
