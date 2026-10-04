import { useEffect, useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { isAxiosError } from 'axios';

import { signInWithGoogle } from '../api/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuthStore } from '../stores/auth';
import { Spinner } from './ui/Spinner';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

const MESSAGES = {
  googleFailed: "Google sign-in didn't complete. Please try again.",
  scriptBlocked:
    "Couldn't load Google sign-in. Check your connection or disable blockers for this site.",
  offline: "You're offline. Connect to sign in.",
  unreachable: "Can't reach the server. Check your connection and try again.",
  fallback: 'Sign-in failed. Please try again.',
} as const;

/**
 * The Google button and its states — signing in, and the four inline errors
 * (docs/features/google-auth.md §5.3). Used by Welcome and the invite preview.
 *
 * The provider is mounted here, so Google's script is fetched only while a
 * signed-out visitor is actually looking at the button. On success the session
 * goes into the store; the screen's guards decide where the user goes next.
 */
export function GoogleSignIn() {
  const [scriptFailed, setScriptFailed] = useState(false);

  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID}
      locale="en"
      onScriptLoadError={() => setScriptFailed(true)}
    >
      <SignInControls scriptFailed={scriptFailed} />
    </GoogleOAuthProvider>
  );
}

function SignInControls({ scriptFailed }: { scriptFailed: boolean }) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const prefersDark = usePrefersDark();

  async function handleCredential(credential: string | undefined) {
    if (!credential) {
      setError(MESSAGES.googleFailed);
      return;
    }

    setError(null);
    setSigningIn(true);
    try {
      const session = await signInWithGoogle(credential);
      useAuthStore.getState().setSession(session);
    } catch (caught) {
      setError(messageFor(caught));
      setSigningIn(false);
    }
  }

  const blockingMessage = !online ? MESSAGES.offline : scriptFailed ? MESSAGES.scriptBlocked : null;
  const shownError = blockingMessage ?? error;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {shownError && (
        <p
          role="alert"
          className="w-full rounded-xl bg-danger-soft px-4 py-3 text-center text-sm text-danger"
        >
          {shownError}
        </p>
      )}

      <div className="flex min-h-11 items-center justify-center">
        {signingIn ? (
          <Spinner label="Signing you in…" />
        ) : (
          !blockingMessage && (
            <GoogleLogin
              onSuccess={(response) => void handleCredential(response.credential)}
              onError={() => setError(MESSAGES.googleFailed)}
              text="continue_with"
              shape="pill"
              size="large"
              theme={prefersDark ? 'filled_black' : 'outline'}
              width={280}
            />
          )
        )}
      </div>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (isAxiosError<{ message?: string }>(error)) {
    if (!error.response) {
      return MESSAGES.unreachable;
    }
    return error.response.data?.message ?? MESSAGES.fallback;
  }
  return MESSAGES.fallback;
}

/** Google's button is styled by Google; this only picks its light or dark variant. */
function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) {
      return;
    }
    const update = () => setDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return dark;
}
