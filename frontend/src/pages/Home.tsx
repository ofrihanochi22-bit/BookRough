import { SignedInPlaceholder } from '../components/SignedInPlaceholder';
import { useAuthStore } from '../stores/auth';

/** Placeholder. The Communities Dashboard replaces it in Phase 2. */
export function Home() {
  const displayName = useAuthStore((state) => state.user?.displayName);

  return (
    <SignedInPlaceholder
      title={displayName ? `Hi, ${displayName}` : 'You’re signed in'}
      note="You’re signed in. Communities arrive in Phase 2."
    />
  );
}
