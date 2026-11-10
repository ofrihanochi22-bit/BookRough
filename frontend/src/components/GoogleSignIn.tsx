import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { type SignInIntent, signInWithGoogle } from '../api/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuthStore } from '../stores/auth';
import { GoogleCredentialButton } from './GoogleCredentialButton';
import { Button } from './ui/Button';
import { PillTrack } from './ui/PillTrack';

export const SIGN_IN_COPY = {
  question: 'How do you want to continue?',
  noAccount: 'No account for this Google account yet.',
  alreadyRegistered: 'You already have an account. Signing you in.',
  expired: 'Your Google sign-in expired. Try again.',
  failed: 'Sign-in failed. Please try again.',
} as const;

const OPTIONS: ReadonlyArray<{ intent: SignInIntent; label: string }> = [
  { intent: 'signin', label: 'Sign in' },
  { intent: 'signup', label: 'Create account' },
];

/**
 * Signing in with Google, used by Welcome and the invite preview —
 * docs/features/sign-in-sign-up.md §5.1. A Sign in / Create account switch
 * sits above ONE Google button: Google's script keeps a single global callback,
 * so two buttons on a page would mix up the intents. Sign in without an account
 * creates nothing; the credential is kept in memory so Create account finishes
 * without a second popup. On success the session goes into the store, and each
 * screen's guards decide where the user goes next.
 */
export function GoogleSignIn({ defaultIntent = 'signin' }: { defaultIntent?: SignInIntent }) {
  const [intent, setIntent] = useState<SignInIntent>(defaultIntent);
  /** Set after Sign in found no account: the credential to create it with. */
  const [pending, setPending] = useState<string | null>(null);
  const online = useOnlineStatus();

  async function finish(credential: string, chosen: SignInIntent) {
    const session = await signInWithGoogle(credential, chosen);
    if (chosen === 'signup' && !session.created) {
      toast.success(SIGN_IN_COPY.alreadyRegistered);
    }
    useAuthStore.getState().setSession(session);
  }

  if (pending) {
    return (
      <NoAccountNotice
        credential={pending}
        online={online}
        onCreate={(credential) => finish(credential, 'signup')}
        onDismiss={(expired) => {
          setPending(null);
          // After an expired retry, the person meant to create one.
          if (expired) {
            setIntent('signup');
          }
        }}
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* ui-redesign.md §5.12: the kit's pill track, the selected side on tape paper. */}
      <div className="w-full max-w-xs">
        <PillTrack
          label={SIGN_IN_COPY.question}
          options={OPTIONS.map((option) => ({ value: option.intent, label: option.label }))}
          value={intent}
          onChange={setIntent}
          disabled={!online}
        />
      </div>
      <GoogleCredentialButton
        text={intent === 'signin' ? 'signin_with' : 'signup_with'}
        busyLabel={intent === 'signin' ? 'Signing you in…' : 'Creating your account…'}
        onCredential={async (credential) => {
          try {
            await finish(credential, intent);
          } catch (error) {
            if (isAxiosError(error) && error.response?.status === 404 && intent === 'signin') {
              setPending(credential);
              return;
            }
            throw error;
          }
        }}
      />
    </div>
  );
}

/** D2: Sign in found no account (sign-in-sign-up.md §5.1). */
function NoAccountNotice({
  credential,
  online,
  onCreate,
  onDismiss,
}: {
  credential: string;
  online: boolean;
  onCreate: (credential: string) => Promise<void>;
  onDismiss: (expired: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(credential);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      setBusy(false);
      if (status === 401) {
        // The kept Google token expired: start over with the button.
        setError(SIGN_IN_COPY.expired);
        return;
      }
      setError(SIGN_IN_COPY.failed);
    }
  }

  const expired = error === SIGN_IN_COPY.expired;

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3 text-center">
      <p role="status" className="text-sm">
        {expired ? SIGN_IN_COPY.expired : SIGN_IN_COPY.noAccount}
      </p>
      {error && !expired && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!expired && (
        <Button busy={busy} disabled={!online} onClick={() => void create()} className="w-full">
          {busy ? 'Creating your account…' : 'Create account'}
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => onDismiss(expired)}
        className="w-full"
      >
        {expired ? 'Try again' : 'Use another Google account'}
      </Button>
    </div>
  );
}
