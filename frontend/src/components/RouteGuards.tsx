import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { fetchSession } from '../api/auth';
import { homePathFor, useAuthStore } from '../stores/auth';
import { Button } from './ui/Button';
import { ScreenLayout } from './ui/ScreenLayout';
import { Spinner } from './ui/Spinner';

/**
 * Resolves the session once, on app load, before any route renders. Until it
 * answers, a spinner fills the screen — never Welcome, which would flash for a
 * user who is in fact signed in.
 *
 * Only a 401 means "signed out". Any other failure (offline, timeout, a 5xx
 * while the API restarts) says nothing about the session, so it gets a retry
 * screen instead of throwing away a cookie that may well still be valid.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const [unreachable, setUnreachable] = useState(false);
  const started = useRef(false);

  const resolveSession = useCallback(() => {
    setUnreachable(false);
    fetchSession()
      .then((session) => useAuthStore.getState().setSession(session))
      .catch((error: unknown) => {
        if (isAxiosError(error) && error.response?.status === 401) {
          useAuthStore.getState().clear();
        } else {
          setUnreachable(true);
        }
      });
  }, []);

  useEffect(() => {
    // A ref, not a flag in the effect: StrictMode runs effects twice in
    // development, and the ref survives that so /auth/me is called once.
    if (started.current || useAuthStore.getState().status !== 'unknown') {
      return;
    }
    started.current = true;
    resolveSession();
  }, [resolveSession]);

  if (status === 'unknown') {
    return (
      <ScreenLayout centered>
        {unreachable ? (
          <div role="alert" className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">
              Can&apos;t reach BookRough right now. Check your connection and try again.
            </p>
            <Button onClick={resolveSession}>Try again</Button>
          </div>
        ) : (
          <Spinner label="Opening BookRough…" />
        )}
      </ScreenLayout>
    );
  }

  return children;
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
