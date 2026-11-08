import { type FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { editPostComment, type PublicPost } from '../api/posts';
import { ACTION_FAILED } from '../lib/friendCopy';
import { checkPostComment, cleanPostComment, COMMENT_MAX_GRAPHEMES } from '../lib/postText';
import { graphemeCount } from '../lib/textRules';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface EditCommentSheetProps {
  post: PublicPost;
  online: boolean;
  onClose: () => void;
  /** Saved: the post as the server now has it. */
  onSaved: (post: PublicPost) => void;
  /** Gone or no longer editable (404/403): the list should reload. */
  onStale: () => void;
}

export const COMMENT_UPDATED = 'Comment updated';
export const EDIT_OFFLINE = "You're offline. Connect to edit.";

/**
 * The author edits their comment — docs/features/edit-post-comment.md §5.2. The
 * song never changes. The draft survives any failure; a server 422 shows inline.
 */
export function EditCommentSheet({
  post,
  online,
  onClose,
  onSaved,
  onStale,
}: EditCommentSheetProps) {
  const [comment, setComment] = useState(post.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const check = checkPostComment(comment);
  const error = check.ok ? serverError : check.message;
  const unchanged = check.ok && check.value === post.comment;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || unchanged || busy) {
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const updated = await editPostComment(post.id, check.value);
      toast.success(COMMENT_UPDATED);
      onSaved(updated);
      onClose();
    } catch (caught) {
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      if (response?.status === 422) {
        setServerError(response.data?.message ?? ACTION_FAILED);
      } else if (response?.status === 403 || response?.status === 404) {
        toast.error(response.data?.message ?? ACTION_FAILED);
        onClose();
        onStale();
      } else {
        toast.error(ACTION_FAILED);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Edit comment" onClose={onClose} dismissible={!busy}>
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor="edit-comment" className="text-sm font-medium">
              Comment
            </label>
            <span className="text-xs text-muted" aria-hidden="true">
              {graphemeCount(cleanPostComment(comment))}/{COMMENT_MAX_GRAPHEMES}
            </span>
          </div>
          <textarea
            id="edit-comment"
            rows={3}
            value={comment}
            readOnly={busy}
            maxLength={4000}
            onChange={(event) => {
              setComment(event.target.value);
              setServerError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby="edit-comment-error"
            className={`w-full rounded-xl border bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent read-only:opacity-60 ${
              error ? 'border-danger' : 'border-line'
            }`}
          />
          <p
            id="edit-comment-error"
            aria-live="polite"
            className="text-xs text-danger empty:hidden"
          >
            {error}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" disabled={busy} onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            busy={busy}
            disabled={!online || unchanged || !check.ok}
            className="flex-1"
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {!online && (
          <p role="note" className="text-center text-xs text-muted">
            {EDIT_OFFLINE}
          </p>
        )}
      </form>
    </Sheet>
  );
}
