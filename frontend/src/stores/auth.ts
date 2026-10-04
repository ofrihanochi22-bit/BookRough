import { create } from 'zustand';

import { pendingInvite } from '../lib/pendingInvite';

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
  setSession: (session: Session) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  user: null,
  needsOnboarding: false,
  isAdmin: false,
  setSession: ({ user, needsOnboarding, isAdmin }) =>
    set({ status: 'signedIn', user, needsOnboarding, isAdmin }),
  clear: () => set({ status: 'signedOut', user: null, needsOnboarding: false, isAdmin: false }),
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
