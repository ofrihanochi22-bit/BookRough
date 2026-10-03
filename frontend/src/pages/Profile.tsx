import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { useSignOut } from '../hooks/useSignOut';
import { streamingServiceLabel } from '../lib/streamingServices';
import { useAuthStore } from '../stores/auth';

/**
 * The Profile tab, minimal for now: who is signed in, and Sign out. The full
 * My Profile / Settings screen (UC-3, UC-4) replaces it in its own feature.
 */
export function Profile() {
  const user = useAuthStore((state) => state.user);
  const { signingOut, signOut } = useSignOut();

  if (!user) {
    return null;
  }

  return (
    <ScreenLayout>
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <Avatar id={user.id} name={user.displayName} pictureUrl={user.profilePictureUrl} />
        <h1 className="font-display text-2xl font-medium">{user.displayName}</h1>
        {user.preferredService && (
          <p className="text-sm text-muted">
            Listens on {streamingServiceLabel(user.preferredService)}
          </p>
        )}
        <Button variant="secondary" busy={signingOut} onClick={signOut} className="mt-4">
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </ScreenLayout>
  );
}
