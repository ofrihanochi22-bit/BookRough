import { signInWithGoogle } from '../api/auth';
import { useAuthStore } from '../stores/auth';
import { GoogleCredentialButton } from './GoogleCredentialButton';

/**
 * Signing in with Google (docs/features/google-auth.md §5.3), used by Welcome
 * and the invite preview. On success the session goes into the store; each
 * screen's guards decide where the user goes next.
 */
export function GoogleSignIn() {
  return (
    <GoogleCredentialButton
      busyLabel="Signing you in…"
      onCredential={async (credential) => {
        const session = await signInWithGoogle(credential);
        useAuthStore.getState().setSession(session);
      }}
    />
  );
}
