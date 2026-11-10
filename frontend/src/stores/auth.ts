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
  /**
   * Items closed on this device since sign-in. A later session from the server
   * (a profile save, say) may still say "show" if the background PATCH failed
   * or has not landed yet; these stay hidden regardless until sign-out.
   */
  tutorialClosed: TutorialItem[];
  /**
   * Opened from the remembered session because the server was unreachable
   * (docs/features/pwa-offline.md §3.3). Read-only until /auth/me confirms it.
   */
  offline: boolean;
  setSession: (session: Session, options?: { offline?: boolean }) => void;
  /** Hides one tutorial item at once; the server is told separately (lib/tutorial.ts). */
  markTutorialSeen: (item: TutorialItem) => void;
  /** The server answered 403 to an admin request: the role was taken away. */
  revokeAdmin: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'unknown',
  user: null,
  needsOnboarding: false,
  isAdmin: false,
  tutorial: NO_TUTORIAL,
  tutorialClosed: [],
  offline: false,
  setSession: (session, { offline = false } = {}) => {
    if (!offline) {
      saveSessionSnapshot(session);
      claimSavedApiAnswers(session.user.id);
    }
    // The remembered session carries no tutorial, so an offline launch shows none.
    const { user, needsOnboarding, isAdmin, tutorial = NO_TUTORIAL } = session;
    set((state) => ({
      status: 'signedIn',
      user,
      needsOnboarding,
      isAdmin,
      offline,
      tutorial: {
        walkthrough: tutorial.walkthrough && !state.tutorialClosed.includes('walkthrough'),
        saveTip: tutorial.saveTip && !state.tutorialClosed.includes('saveTip'),
        listTip: tutorial.listTip && !state.tutorialClosed.includes('listTip'),
      },
    }));
  },
  markTutorialSeen: (item) =>
    set((state) => ({
      tutorial: { ...state.tutorial, [item]: false },
      tutorialClosed: state.tutorialClosed.includes(item)
        ? state.tutorialClosed
        : [...state.tutorialClosed, item],
    })),
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
      tutorial: NO_TUTORIAL,
      tutorialClosed: [],
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
