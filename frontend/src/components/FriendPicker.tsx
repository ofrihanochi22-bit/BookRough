import { Link } from 'react-router-dom';

import type { CandidateStatus, InviteCandidate } from '../api/invitations';
import { PersonLink } from './PersonLink';
import { Button } from './ui/Button';
import { LoadError } from './ui/LoadError';
import { Skeleton } from './ui/Skeleton';

interface FriendPickerProps {
  /** Null while loading. */
  candidates: InviteCandidate[] | null;
  failed: boolean;
  onRetry: () => void;
  online: boolean;
  /**
   * `select`: checkboxes, for the Create form. `manage`: Invite / Invited
   * buttons, for the Invite panel (invite-friends.md §5.1).
   */
  mode: 'select' | 'manage';
  selected?: ReadonlySet<string>;
  onToggle?: (userId: string) => void;
  onInvite?: (candidate: InviteCandidate) => void;
  onCancel?: (candidate: InviteCandidate) => void;
  /** The user id whose action is in flight. */
  busy?: string | null;
}

const LABELS: Record<Exclude<CandidateStatus, 'INVITABLE' | 'INVITED'>, string> = {
  MEMBER: 'Member',
  BLOCKED: 'Blocked',
};

/** The caller's friends, each with what can be done about them here. */
export function FriendPicker({
  candidates,
  failed,
  onRetry,
  online,
  mode,
  selected,
  onToggle,
  onInvite,
  onCancel,
  busy = null,
}: FriendPickerProps) {
  if (failed) {
    return <LoadError message="Couldn't load your friends." onRetry={onRetry} />;
  }
  if (!candidates) {
    return (
      <div role="status" aria-label="Loading your friends" className="flex flex-col gap-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted">
        You don&apos;t have friends on BookRough yet.{' '}
        <Link to="/search" className="text-accent underline">
          Find people
        </Link>
      </p>
    );
  }

  return (
    <ul aria-label="Your friends" className="flex flex-col divide-y divide-line">
      {candidates.map((candidate) => {
        const { user, status } = candidate;
        return (
          <li key={user.id} className="flex items-center gap-2 py-1">
            <PersonLink user={user} className="text-sm" />
            {status === 'MEMBER' || status === 'BLOCKED' ? (
              <span className="flex min-h-11 items-center px-2 text-xs text-muted">
                {LABELS[status]}
              </span>
            ) : mode === 'select' ? (
              <input
                type="checkbox"
                aria-label={`Invite ${user.displayName}`}
                checked={selected?.has(user.id) ?? false}
                disabled={!online}
                onChange={() => onToggle?.(user.id)}
                className="size-11 shrink-0 accent-accent"
              />
            ) : status === 'INVITED' ? (
              <Button
                variant="secondary"
                aria-label={`Invited ${user.displayName}, tap to cancel`}
                busy={busy === user.id}
                disabled={!online || busy !== null}
                onClick={() => onCancel?.(candidate)}
              >
                Invited
              </Button>
            ) : (
              <Button
                aria-label={`Invite ${user.displayName}`}
                busy={busy === user.id}
                disabled={!online || busy !== null}
                onClick={() => onInvite?.(candidate)}
              >
                Invite
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
