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

/** What of the onboarding tutorial is still to show (docs/features/onboarding-tutorial.md §4). */
export interface TutorialState {
  walkthrough: boolean;
  saveTip: boolean;
  listTip: boolean;
}
export type TutorialItem = keyof TutorialState;

/** Nothing to show — signed out, or a session without the field. */
export const NO_TUTORIAL: TutorialState = { walkthrough: false, saveTip: false, listTip: false };

export interface Session {
  user: PublicUser;
  needsOnboarding: boolean;
  /** The caller's own tutorial state; always sent by the server, optional for older fixtures. */
  tutorial?: TutorialState;
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
  tutorial: TutorialState;
  setSession: (session: Session) => void;
  /** Hides one tutorial item at once; the server is told separately (lib/tutorial.ts). */
  markTutorialSeen: (item: TutorialItem) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  user: null,
  needsOnboarding: false,
  isAdmin: false,
  tutorial: NO_TUTORIAL,
  setSession: ({ user, needsOnboarding, isAdmin, tutorial }) =>
    set({ status: 'signedIn', user, needsOnboarding, isAdmin, tutorial: tutorial ?? NO_TUTORIAL }),
  markTutorialSeen: (item) => set((state) => ({ tutorial: { ...state.tutorial, [item]: false } })),
  clear: () =>
    set({
      status: 'signedOut',
      user: null,
      needsOnboarding: false,
      isAdmin: false,
      tutorial: NO_TUTORIAL,
    }),
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
