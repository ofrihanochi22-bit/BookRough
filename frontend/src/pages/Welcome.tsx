import { useEffect, useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { isAxiosError } from 'axios';

import { signInWithGoogle } from '../api/auth';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Spinner } from '../components/ui/Spinner';
import { Wordmark } from '../components/ui/Wordmark';
import { useAuthStore } from '../stores/auth';

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
 * Welcome — the only way in (CLAUDE.md §5, docs/features/google-auth.md §5.3).
 *
 * The Google provider wraps this screen only, so Google's script is fetched
 * when a signed-out visitor is actually looking at the sign-in button, and
 * nowhere else in the app.
 */
export function Welcome() {
  const [scriptFailed, setScriptFailed] = useState(false);

  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID}
      locale="en"
      onScriptLoadError={() => setScriptFailed(true)}
    >
      <WelcomeContent scriptFailed={scriptFailed} />
    </GoogleOAuthProvider>
  );
}

function WelcomeContent({ scriptFailed }: { scriptFailed: boolean }) {
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
      // SignedOutOnly redirects as soon as the store says signed in.
      useAuthStore.getState().setSession(session);
    } catch (caught) {
      setError(messageFor(caught));
      setSigningIn(false);
    }
  }

  const blockingMessage = !online ? MESSAGES.offline : scriptFailed ? MESSAGES.scriptBlocked : null;
  const shownError = blockingMessage ?? error;

  return (
    <ScreenLayout>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Wordmark />
        <p className="max-w-xs text-base text-muted">
          Share music with friends, on whatever app they use.
        </p>
        <div aria-hidden="true" className="mt-4 flex items-center gap-2 text-xs font-medium">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-accent-ink">
            Spotify link
          </span>
          <span className="text-accent">→</span>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-accent-ink">Apple Music</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pb-4">
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

        <p className="text-xs text-muted">No passwords. We never store your email.</p>
      </div>
    </ScreenLayout>
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

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
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
