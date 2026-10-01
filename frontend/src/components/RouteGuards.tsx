import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { fetchSession } from '../api/auth';
import { homePathFor, useAuthStore } from '../stores/auth';
import { ScreenLayout } from './ui/ScreenLayout';
import { Spinner } from './ui/Spinner';

/**
 * Resolves the session once, on app load, before any route renders. Until it
 * answers, a spinner fills the screen — never Welcome, which would flash for a
 * user who is in fact signed in.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const started = useRef(false);

  useEffect(() => {
    // A ref, not a flag in the effect: StrictMode runs effects twice in
    // development, and the ref survives that so /auth/me is called once.
    if (started.current || useAuthStore.getState().status !== 'unknown') {
      return;
    }
    started.current = true;

    fetchSession()
      .then((session) => useAuthStore.getState().setSession(session))
      .catch(() => useAuthStore.getState().clear());
  }, []);

  if (status === 'unknown') {
    return (
      <ScreenLayout centered>
        <Spinner label="Opening BookRough…" />
      </ScreenLayout>
    );
  }

  return children;
}

/** Welcome is for signed-out visitors only; anyone else is sent onward. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status, needsOnboarding } = useAuthStore();

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
  const { status, needsOnboarding } = useAuthStore();

  if (status !== 'signedIn') {
    return <Navigate to="/" replace />;
  }
  if (needsOnboarding !== (onboarding === 'pending')) {
    return <Navigate to={homePathFor(needsOnboarding)} replace />;
  }
  return children;
}
