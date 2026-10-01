import { useState } from 'react';

import { logout } from '../api/auth';
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
      useAuthStore.getState().clear();
    } catch {
      setSigningOut(false);
    }
  }

  return { signingOut, signOut };
}
