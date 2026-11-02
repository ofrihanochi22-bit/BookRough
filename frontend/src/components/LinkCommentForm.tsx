import { type FormEvent, useState } from 'react';

import type { NewPost } from '../api/posts';
import {
  checkPostComment,
  cleanPostComment,
  COMMENT_MAX_GRAPHEMES,
  CONVERTING_COPY,
} from '../lib/postText';
import { INVALID_LINK, parseSupportedLink } from '../lib/supportedLinks';
import { graphemeCount } from '../lib/textRules';
import { Button } from './ui/Button';

/** How a submit ended; anything but `done` keeps the draft. */
export type LinkFormOutcome =
  | { status: 'done' }
  | { status: 'link-error'; message: string }
  | { status: 'error'; message: string }
  | { status: 'gone' };

interface LinkCommentFormProps {
  /** The form's accessible name. */
  name: string;
  linkLabel: string;
  submitLabel: string;
  online: boolean;
  submit: (input: NewPost) => Promise<LinkFormOutcome>;
  /** While true, the request is running: a sheet around the form must not close. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

const inputClass =
  'w-full rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent read-only:opacity-60';

/**
 * Paste a link, optionally comment, submit — shared by the community composer
 * (docs/features/posts-feed.md §5.2) and the send sheet (direct-recommendations.md
 * §5.3). The request waits for the whole conversion, so the busy state is
 * designed, and the draft is never lost: it clears only once the item exists.
 */
export function LinkCommentForm({
  name,
  linkLabel,
  submitLabel,
  online,
  submit,
  onBusyChange,
  className = '',
}: LinkCommentFormProps) {
  const [url, setUrl] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commentCheck = checkPostComment(comment);
  const commentError = commentCheck.ok ? null : commentCheck.message;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setError(null);
    const link = parseSupportedLink(url);
    if (!link) {
      setLinkError(INVALID_LINK);
      return;
    }
    if (!commentCheck.ok) {
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
    const outcome = await submit({ url: link.url, comment: commentCheck.value });
    if (outcome.status === 'done') {
      setUrl('');
      setComment('');
    } else if (outcome.status === 'link-error') {
      setLinkError(outcome.message);
    } else if (outcome.status === 'error') {
      setError(outcome.message);
    }
    setBusy(false);
    onBusyChange?.(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={name}
      className={`flex flex-col gap-3 ${className}`}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="post-url" className="text-sm font-medium">
          {linkLabel}
        </label>
        <input
          id="post-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://open.spotify.com/track/…"
          value={url}
          readOnly={busy}
          maxLength={4096}
          onChange={(event) => {
            setUrl(event.target.value);
            setLinkError(null);
          }}
          aria-invalid={linkError !== null}
          aria-describedby="post-url-error"
          className={`min-h-11 ${inputClass} ${linkError ? 'border-danger' : 'border-line'}`}
        />
        <p id="post-url-error" aria-live="polite" className="text-xs text-danger empty:hidden">
          {linkError}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="post-comment" className="text-sm font-medium">
            Comment <span className="font-normal text-muted">(optional)</span>
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanPostComment(comment))}/{COMMENT_MAX_GRAPHEMES}
          </span>
        </div>
        <textarea
          id="post-comment"
          rows={2}
          value={comment}
          readOnly={busy}
          maxLength={4000}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={commentError !== null}
          aria-describedby="post-comment-error"
          className={`py-3 ${inputClass} ${commentError ? 'border-danger' : 'border-line'}`}
        />
        <p id="post-comment-error" aria-live="polite" className="text-xs text-danger empty:hidden">
          {commentError}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        type="submit"
        busy={busy}
        disabled={!online || url.trim() === '' || commentError !== null}
      >
        {busy ? CONVERTING_COPY : submitLabel}
      </Button>
    </form>
  );
}
