import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuthStore } from '../stores/auth';

/**
 * App-wide while offline and signed in: the screens show what was last loaded
 * (docs/features/pwa-offline.md §5.1). Write actions carry their own notes.
 */
export function OfflineBar() {
  const online = useOnlineStatus();
  const signedIn = useAuthStore((state) => state.status === 'signedIn');

  if (online || !signedIn) {
    return null;
  }

  return (
    <p role="status" className="bg-accent-soft px-4 py-2 text-center text-sm text-accent-ink">
      You&apos;re offline — showing what you last loaded.
    </p>
  );
}
