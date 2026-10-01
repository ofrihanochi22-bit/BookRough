import { useSignOut } from '../hooks/useSignOut';
import { useAuthStore } from '../stores/auth';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { ScreenLayout } from './ui/ScreenLayout';

interface SignedInPlaceholderProps {
  title: string;
  note: string;
}

/**
 * Stand-in for Complete Your Profile and the dashboard until their own
 * features land (docs/features/google-auth.md §5.4). It exists so the whole
 * sign-in → sign-out loop can be clicked through today.
 */
export function SignedInPlaceholder({ title, note }: SignedInPlaceholderProps) {
  const user = useAuthStore((state) => state.user);
  const { signingOut, signOut } = useSignOut();

  return (
    <ScreenLayout centered>
      <div className="flex flex-col items-center gap-5 text-center">
        {user && (
          <Avatar id={user.id} name={user.displayName} pictureUrl={user.profilePictureUrl} />
        )}
        <h1 className="font-display text-2xl font-medium">{title}</h1>
        <p className="max-w-xs text-sm text-muted">{note}</p>
        <Button variant="secondary" busy={signingOut} onClick={signOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </ScreenLayout>
  );
}
