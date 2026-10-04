import { GoogleSignIn } from '../components/GoogleSignIn';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Wordmark } from '../components/ui/Wordmark';

/**
 * Welcome — the only way in (CLAUDE.md §5, docs/features/google-auth.md §5.3).
 * The sign-in button and its states live in `GoogleSignIn`, shared with the
 * invite preview; `SignedOutOnly` moves the user on once the store says signed in.
 */
export function Welcome() {
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
        <GoogleSignIn />
        <p className="text-xs text-muted">No passwords. We never store your email.</p>
      </div>
    </ScreenLayout>
  );
}
