import { GoogleSignIn } from '../components/GoogleSignIn';
import { InstallHint } from '../components/InstallHint';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Wordmark } from '../components/ui/Wordmark';
import { useSettingsStore } from '../stores/settings';

/**
 * Welcome — the only way in (CLAUDE.md §5, docs/features/sign-in-sign-up.md §5.2).
 * The Sign in / Create account switch and the Google button live in
 * `GoogleSignIn`, shared with the invite preview; `SignedOutOnly` moves the user on once the store says signed in.
 */
export function Welcome() {
  // Set by the admin (docs/features/admin-panel.md §5.4); the default until then.
  const tagline = useSettingsStore((state) => state.welcomeTagline);

  // ui-redesign.md §5.12: the hero logo fills the top, the tagline under it,
  // and the way in sits at the bottom, within thumb reach. No demo line.
  return (
    <ScreenLayout>
      <InstallHint />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <Wordmark variant="hero" />
        <p className="max-w-xs break-words font-display text-xl font-semibold tracking-[-0.01em] text-ink">
          {tagline}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 pt-8 pb-4">
        <GoogleSignIn />
        <p className="text-xs text-muted">No passwords. We never store your email.</p>
      </div>
    </ScreenLayout>
  );
}
