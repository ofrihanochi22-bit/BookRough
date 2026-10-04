import { useCallback, useEffect, useRef, useState } from 'react';

import { getInvite, inviteUrl, resetInvite } from '../api/invites';
import { useRequest } from '../hooks/useRequest';
import { Button } from './ui/Button';
import { LoadError } from './ui/LoadError';
import { Sheet } from './ui/Sheet';
import { Spinner } from './ui/Spinner';

interface InvitePanelProps {
  communityId: string;
  communityName: string;
  onClose: () => void;
}

const COPIED_FOR_MS = 2000;

/**
 * The admin's invite panel — docs/features/communities-invites.md §5.5: the
 * community's one link, with Share (the iPhone share sheet), Copy and Reset.
 */
export function InvitePanel({ communityId, communityName, onClose }: InvitePanelProps) {
  const load = useCallback(() => getInvite(communityId), [communityId]);
  const invite = useRequest(load);
  /** A token from a reset, which replaces the loaded one. */
  const [resetToken, setResetToken] = useState<string | null>(null);
  /** While a reset is in flight the panel stays open, so its new link is seen. */
  const [resetting, setResetting] = useState(false);
  const token = resetToken ?? (invite.status === 'ready' ? invite.data.token : null);

  return (
    <Sheet title="Invite friends" onClose={onClose} dismissible={!resetting}>
      {invite.status === 'loading' && (
        <div className="py-6">
          <Spinner label="Getting your link…" />
        </div>
      )}
      {invite.status === 'error' && (
        <LoadError message="Couldn't get the invite link." onRetry={invite.reload} />
      )}
      {token && (
        <LinkActions
          communityId={communityId}
          communityName={communityName}
          token={token}
          wasReset={resetToken !== null}
          onReset={setResetToken}
          resetting={resetting}
          onResettingChange={setResetting}
        />
      )}
    </Sheet>
  );
}

interface LinkActionsProps {
  communityId: string;
  communityName: string;
  token: string;
  wasReset: boolean;
  onReset: (token: string) => void;
  resetting: boolean;
  onResettingChange: (resetting: boolean) => void;
}

function LinkActions({
  communityId,
  communityName,
  token,
  wasReset,
  onReset,
  resetting,
  onResettingChange,
}: LinkActionsProps) {
  const url = inviteUrl(token);
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access: select the link so it can be copied by hand.
      field.current?.focus();
      field.current?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: communityName,
        text: `Join ${communityName} on BookRough`,
        url,
      });
    } catch {
      // The user closed the share sheet, or sharing failed; the link is still on screen.
    }
  }

  async function reset() {
    onResettingChange(true);
    setError(null);
    try {
      const fresh = await resetInvite(communityId);
      onReset(fresh.token);
      setConfirming(false);
      // The confirmation (and the focused Reset button) is gone; show the new link.
      field.current?.focus();
    } catch {
      setError("Couldn't reset the link. Please try again.");
    } finally {
      onResettingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Anyone with this link can join {communityName}. Only admins can see it.
      </p>
      <label htmlFor="invite-link" className="sr-only">
        Invite link
      </label>
      <input
        id="invite-link"
        ref={field}
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        className="min-h-11 rounded-xl border border-line bg-canvas px-4 text-sm text-ink"
      />
      {wasReset && (
        <p role="status" className="text-xs text-muted">
          New link created. The old one no longer works.
        </p>
      )}

      <div className="flex gap-3">
        {canShare && (
          <Button onClick={share} className="flex-1">
            Share
          </Button>
        )}
        <Button variant={canShare ? 'secondary' : 'primary'} onClick={copy} className="flex-1">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {confirming ? (
        <div
          role="group"
          aria-label="Confirm reset"
          className="flex flex-col gap-3 rounded-xl border border-line p-4"
        >
          <p className="text-sm">
            Reset the invite link? The current link will stop working for anyone who hasn&apos;t
            joined yet.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={reset} busy={resetting} className="flex-1">
              {resetting ? 'Resetting…' : 'Reset'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 self-center px-4 text-sm text-muted underline-offset-4 hover:underline"
        >
          Reset link
        </button>
      )}
    </div>
  );
}
