import { useEffect, useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { isAxiosError } from 'axios';

import { useOnlineStatus } from '../hooks/useOnlineStatus';
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

interface GoogleCredentialButtonProps {
  /** Sends the credential to the server; a rejection is shown inline. */
  onCredential: (credential: string) => Promise<void>;
  /** Shown with a spinner while `onCredential` runs, e.g. "Signing you in…". */
  busyLabel: string;
}

/**
 * Google's button and its states — busy, and the four inline errors (popup
 * failed, script blocked, offline, server) from docs/features/google-auth.md
 * §5.3. What happens to the credential is the caller's business: signing in
 * (`GoogleSignIn`) or fetching the photo on My Profile.
 *
 * The provider is mounted here, so Google's script is fetched only while the
 * button is actually on screen.
 */
export function GoogleCredentialButton(props: GoogleCredentialButtonProps) {
  const [scriptFailed, setScriptFailed] = useState(false);

  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID}
      locale="en"
      onScriptLoadError={() => setScriptFailed(true)}
    >
      <Controls {...props} scriptFailed={scriptFailed} />
    </GoogleOAuthProvider>
  );
}

function Controls({
  onCredential,
  busyLabel,
  scriptFailed,
}: GoogleCredentialButtonProps & { scriptFailed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const prefersDark = usePrefersDark();

  async function handleCredential(credential: string | undefined) {
    if (!credential) {
      setError(MESSAGES.googleFailed);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onCredential(credential);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
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
        {busy ? (
          <Spinner label={busyLabel} />
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
