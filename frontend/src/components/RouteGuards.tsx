import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { fetchSession } from '../api/auth';
import { NotFound } from '../pages/NotFound';
import { homePathFor, openedFromSnapshot, useAuthStore } from '../stores/auth';
import { LoadingHint } from './ui/LoadingHint';
import { Button } from './ui/Button';
import { ScreenLayout } from './ui/ScreenLayout';
import { Spinner } from './ui/Spinner';

type GateFailure = 'offline' | 'unreachable';

/** No response at all (offline, DNS, a dropped connection), as opposed to an answer. */
function isNoResponse(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}

/**
 * Asks the server who is signed in: an answer becomes the session, a 401
 * signs out. Any other failure goes to `onFailure`, which decides what it means.
 */
function checkSession(onFailure: (error: unknown) => void = () => {}): Promise<void> {
  return fetchSession()
    .then((session) => useAuthStore.getState().setSession(session))
    .catch((error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 401) {
        useAuthStore.getState().clear();
      } else {
        onFailure(error);
      }
    });
}

/**
 * Resolves the session once, on app load, before any route renders. Until it
 * answers, a spinner fills the screen, never Welcome, which would flash for a
 * user who is in fact signed in.
 *
 * With a saved session (client-cache.md §3.3) the app is already signed in and
 * `checkSavedSession` runs behind it. Without one, only a 401 means "signed
 * out": no response at all gets an offline screen that retries when the
 * connection returns, and any other failure (a 5xx while the API restarts) a
 * retry screen, instead of throwing away a cookie that may well still be valid.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const [failure, setFailure] = useState<GateFailure | null>(null);
  const started = useRef(false);

  const resolveSession = useCallback(() => {
    void checkSession((error) => setFailure(isNoResponse(error) ? 'offline' : 'unreachable'));
  }, []);

  const retry = useCallback(() => {
    setFailure(null);
    resolveSession();
  }, [resolveSession]);

  useEffect(() => {
    // A ref, not a flag in the effect: StrictMode runs effects twice in
    // development, and the ref survives that so /auth/me is called once.
    if (started.current) {
      return;
    }
    started.current = true;
    if (useAuthStore.getState().status !== 'unknown') {
      if (openedFromSnapshot) {
        checkSavedSession();
      }
      return;
    }
    resolveSession();
  }, [resolveSession]);

  // An offline launch tries again when the connection returns.
  useEffect(() => {
    if (!failure) {
      return;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failure, retry]);

  return (
    <>
      <ConfirmRememberedSession />
      {status === 'unknown' ? (
        <ScreenLayout centered>
          {failure ? (
            <div role="alert" className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-muted">
                {failure === 'offline'
                  ? "You're offline. Connect to open BookRough."
                  : "Can't reach BookRough right now. Check your connection and try again."}
              </p>
              <Button onClick={retry}>Try again</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Spinner label="Opening BookRough…" />
              <LoadingHint />
            </div>
          )}
        </ScreenLayout>
      ) : (
        children
      )}
    </>
  );
}

/**
 * The app opened from the saved session (client-cache.md §3.3); this checks the
 * cookie behind it. A 401 signs out. No response at all marks the session
 * unconfirmed, so it is read-only until the server answers (pwa-offline.md
 * §3.3, `ConfirmRememberedSession`). A 5xx leaves the screens reading from the
 * cache, and each screen's own request shows its own error if it has nothing
 * cached.
 */
function checkSavedSession(): void {
  void checkSession((error) => {
    if (isNoResponse(error)) {
      useAuthStore.setState({ offline: true });
    }
  });
}

/** How often an unconfirmed session asks the server again while the app is in view. */
const CONFIRM_INTERVAL_MS = 15_000;

/**
 * While the session is unconfirmed (read-only), asks /auth/me again when the
 * connection returns, when the app comes back to the foreground, and every
 * 15 s: the browser may already think it is online (a timeout, a captive
 * portal), so no `online` event would come. Success confirms the session; a
 * 401 signs out like any other.
 */
function ConfirmRememberedSession() {
  const unconfirmed = useAuthStore((state) => state.offline);

  useEffect(() => {
    if (!unconfirmed) {
      return;
    }
    let inFlight = false;
    function confirm() {
      if (inFlight || !navigator.onLine || document.visibilityState !== 'visible') {
        return;
      }
      inFlight = true;
      void checkSession().finally(() => {
        inFlight = false;
      });
    }
    const timer = window.setInterval(confirm, CONFIRM_INTERVAL_MS);
    window.addEventListener('online', confirm);
    document.addEventListener('visibilitychange', confirm);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', confirm);
      document.removeEventListener('visibilitychange', confirm);
    };
  }, [unconfirmed]);

  return null;
}

/** Welcome is for signed-out visitors only; anyone else is sent onward. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);

  if (status === 'signedIn') {
    return <Navigate to={homePathFor(needsOnboarding)} replace />;
  }
  return children;
}

interface RequireSessionProps {
  children: ReactNode;
  /** Which onboarding state this screen is for; the other is redirected. */
  onboarding: 'pending' | 'complete';
}

/**
 * Protected screens. Signed out → Welcome. Signed in but on the wrong side of
 * onboarding → the screen that matches. The backend still authorises every
 * request; this guard is navigation, not security.
 */
export function RequireSession({ children, onboarding }: RequireSessionProps) {
  const status = useAuthStore((state) => state.status);
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);

  if (status !== 'signedIn') {
    return <Navigate to="/" replace />;
  }
  if (needsOnboarding !== (onboarding === 'pending')) {
    return <Navigate to={homePathFor(needsOnboarding)} replace />;
  }
  return children;
}

/**
 * The admin area (docs/features/admin-panel.md §5.1). Anyone who is not a
 * signed-in admin — signed-out visitors included — gets the standard not-found
 * page, rendered without a request, so the area is indistinguishable from a
 * path that does not exist. The server refuses them regardless (CLAUDE.md §17).
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  if (status !== 'signedIn' || !isAdmin) {
    return <NotFound />;
  }
  return children;
}
