import { useState } from 'react';

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSignOut } from '../hooks/useSignOut';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

/**
 * UC-3's confirmation — docs/features/visible-sign-out.md §5.3. On success the
 * store is cleared and the route guards leave this screen; on failure the
 * interceptor has toasted, and the sheet stays open to retry or cancel.
 */
export function SignOutSheet({ onClose }: { onClose: () => void }) {
  const { signingOut, signOut } = useSignOut();
  const online = useOnlineStatus();

  return (
    <Sheet title="Sign out?" onClose={onClose} dismissible={!signingOut}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">You&apos;ll need to continue with Google to sign back in.</p>
        <div className="flex gap-3">
          <Button variant="secondary" disabled={signingOut} onClick={onClose} className="flex-1">
            Cancel
          </Button>
          {/* The HttpOnly cookie can only be cleared by the server (visible-sign-out.md §5.3). */}
          <Button
            busy={signingOut}
            disabled={!online}
            onClick={() => void signOut()}
            className="flex-1"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
        {!online && (
          <p role="note" className="text-center text-xs text-muted">
            You&apos;re offline. Connect to sign out.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** A Sign out button that asks first — Home's header and My Profile (§5.1, §5.2). */
export function SignOutButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className={className}>
        Sign out
      </Button>
      {open && <SignOutSheet onClose={() => setOpen(false)} />}
    </>
  );
}
