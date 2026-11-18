import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import {
  deleteAdminCommunity,
  deleteAdminUser,
  fetchUserDeletionPreview,
  type AdminCommunity,
  type AdminUser,
  type UserDeletionPreview,
} from '../api/admin';
import { useRequest } from '../hooks/useRequest';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { Spinner } from './ui/Spinner';

/** The "Are you sure?" dialogs of Admin → Users and Communities — docs/features/admin-delete.md §5. */

function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "12 posts, 30 ratings and 8 comments". */
function contentCounts(counts: UserDeletionPreview['counts']): string {
  const posts = plural(counts.posts, 'post', 'posts');
  const ratings = plural(counts.ratings, 'rating', 'ratings');
  const comments = plural(counts.comments, 'comment', 'comments');
  return `${posts}, ${ratings} and ${comments}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return (isAxiosError<{ message?: string }>(error) && error.response?.data?.message) || fallback;
}

function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** One "Are you sure?" sheet: the body, an inline error, and Cancel / the danger action. */
function ConfirmDeleteSheet({
  confirmLabel,
  ready,
  error,
  onConfirm,
  onClose,
  busy,
  children,
}: {
  confirmLabel: string;
  ready: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet title="Are you sure?" onClose={onClose} dismissible={!busy}>
      <div className="flex flex-col gap-4">
        {children}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" disabled={busy} onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="destructive"
            busy={busy}
            disabled={!ready}
            onClick={onConfirm}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Runs the delete; a 404 means someone already did it, which counts as done. */
function useDelete(
  run: () => Promise<void>,
  onDeleted: (alreadyGone: boolean) => void,
  fallback: string,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await run();
      onDeleted(false);
    } catch (caught) {
      setBusy(false);
      if (isNotFound(caught)) {
        onDeleted(true);
      } else {
        setError(errorMessage(caught, fallback));
      }
    }
  }

  return { busy, error, confirm: () => void confirm() };
}

export function DeleteUserSheet({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  /** The row should leave the list; the sheet has already toasted. */
  onDeleted: () => void;
}) {
  const load = useCallback(() => fetchUserDeletionPreview(user.id), [user.id]);
  const preview = useRequest(load);
  const name = user.displayName ?? 'this user';
  const finish = useCallback(
    (alreadyGone: boolean) => {
      toast.success(alreadyGone ? 'That user was already deleted.' : `${name} was deleted.`);
      onClose();
      onDeleted();
    },
    [name, onClose, onDeleted],
  );
  const { busy, error, confirm } = useDelete(
    () => deleteAdminUser(user.id),
    finish,
    "Couldn't delete the user. Try again.",
  );
  // A 404 on the preview means someone already deleted them: done, like a 404 on delete.
  const previewGone = preview.status === 'error' && isNotFound(preview.error);
  useEffect(() => {
    if (previewGone) {
      finish(true);
    }
  }, [previewGone, finish]);

  return (
    <ConfirmDeleteSheet
      confirmLabel="Delete user"
      ready={preview.status === 'ready'}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
      busy={busy}
    >
      {preview.status === 'loading' && <Spinner label="Loading what will be deleted…" />}
      {preview.status === 'error' && !previewGone && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-danger">
            {errorMessage(preview.error, "Couldn't load what will be deleted.")}
          </p>
          <Button variant="secondary" onClick={preview.reload} className="self-start px-4">
            Retry
          </Button>
        </div>
      )}
      {preview.status === 'ready' && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Delete <strong>{name}</strong> and everything they posted?{' '}
            {contentCounts(preview.data.counts)} will be deleted, including replies others wrote
            under them. This can&apos;t be undone.
          </p>
          {preview.data.communities.length > 0 && (
            <ul className="flex flex-col gap-1">
              {preview.data.communities.map((community) => (
                <li key={community.id}>
                  {community.outcome === 'TRANSFER' ? (
                    <>
                      <strong>{community.name}</strong> passes to{' '}
                      <strong>
                        {community.newOwner?.displayName ?? 'a member not finished signing up'}
                      </strong>
                      .
                    </>
                  ) : (
                    <>
                      <strong>{community.name}</strong> will be deleted.
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ConfirmDeleteSheet>
  );
}

export function DeleteCommunitySheet({
  community,
  onClose,
  onDeleted,
}: {
  community: AdminCommunity;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, error, confirm } = useDelete(
    () => deleteAdminCommunity(community.id),
    (alreadyGone) => {
      toast.success(
        alreadyGone ? 'That community was already deleted.' : `${community.name} was deleted.`,
      );
      onClose();
      onDeleted();
    },
    "Couldn't delete the community. Try again.",
  );
  const members =
    community.memberCount === 1
      ? 'Its 1 member loses its posts, ratings and comments, and will be told an admin removed it.'
      : `All ${community.memberCount} members lose its posts, ratings and comments, and each will be told an admin removed it.`;

  return (
    <ConfirmDeleteSheet
      confirmLabel="Delete community"
      ready
      error={error}
      onConfirm={confirm}
      onClose={onClose}
      busy={busy}
    >
      <p className="text-sm">
        Delete <strong>{community.name}</strong>? {members} This can&apos;t be undone.
      </p>
    </ConfirmDeleteSheet>
  );
}
