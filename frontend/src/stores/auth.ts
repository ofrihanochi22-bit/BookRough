import { create } from 'zustand';

import { claimSavedApiAnswers, clearSavedApiAnswers } from '../lib/offlineCache';
import { pendingInvite } from '../lib/pendingInvite';
import { clearSessionSnapshot, saveSessionSnapshot } from '../lib/sessionSnapshot';

export type StreamingService = 'SPOTIFY' | 'APPLE_MUSIC' | 'YOUTUBE' | 'TIDAL' | 'DEEZER';

/** Mirrors the backend's PublicUser — the only user shape the API sends. */
export interface PublicUser {
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  preferredService: StreamingService | null;
  createdAt: string;
}

export interface Session {
  user: PublicUser;
  needsOnboarding: boolean;
  /** The caller's own admin flag (docs/features/admin-panel.md §4.1). Navigation only — the server authorises. */
  isAdmin: boolean;
}

/**
 * `unknown` until the first GET /auth/me answers. The app renders a spinner,
 * not Welcome, while unknown — so a signed-in user never sees Welcome flash.
 */
export type AuthStatus = 'unknown' | 'signedIn' | 'signedOut';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  needsOnboarding: boolean;
  isAdmin: boolean;
  /**
   * Opened from the remembered session because the server was unreachable
   * (docs/features/pwa-offline.md §3.3). Read-only until /auth/me confirms it.
   */
  offline: boolean;
  setSession: (session: Session, options?: { offline?: boolean }) => void;
  /** The server answered 403 to an admin request: the role was taken away. */
  revokeAdmin: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'unknown',
  user: null,
  needsOnboarding: false,
  isAdmin: false,
  offline: false,
  setSession: (session, { offline = false } = {}) => {
    if (!offline) {
      saveSessionSnapshot(session);
      claimSavedApiAnswers(session.user.id);
    }
    const { user, needsOnboarding, isAdmin } = session;
    set({ status: 'signedIn', user, needsOnboarding, isAdmin, offline });
  },
  revokeAdmin: () => {
    const { user, needsOnboarding, offline } = get();
    set({ isAdmin: false });
    // Keep the remembered session in step, or an offline launch would restore the role.
    if (user && !offline) {
      saveSessionSnapshot({ user, needsOnboarding, isAdmin: false });
    }
  },
  // Sign-out and every 401: nothing of this user is left readable on the device.
  clear: () => {
    clearSessionSnapshot();
    clearSavedApiAnswers();
    set({
      status: 'signedOut',
      user: null,
      needsOnboarding: false,
      isAdmin: false,
      offline: false,
    });
  },
}));

/**
 * Where a signed-in user belongs, given their onboarding state. An invite they
 * opened before signing in wins over the dashboard, so a new friend finishes
 * onboarding and lands back on it (docs/features/communities-invites.md §5.4).
 */
export function homePathFor(needsOnboarding: boolean): string {
  if (needsOnboarding) {
    return '/onboarding';
  }
  return pendingInvite() ?? '/home';
}
