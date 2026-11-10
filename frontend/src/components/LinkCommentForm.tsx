import { type FormEvent, useId, useState } from 'react';

import type { NewPost } from '../api/posts';
import {
  checkPostComment,
  cleanPostComment,
  COMMENT_MAX_GRAPHEMES,
  CONVERTING_COPY,
  FETCHING_COPY,
} from '../lib/postText';
import { INVALID_LINK, parseSharedLink } from '../lib/supportedLinks';
import { graphemeCount } from '../lib/textRules';
import { useMixtape } from '../stores/design';
import { Button } from './ui/Button';
import { ReelCassette } from './ui/Cassette';
import { fieldClass } from './ui/field';

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
  const mixtape = useMixtape();
  // Unique per form: the feed's composer and the Share sheet's can be mounted together.
  const id = useId();
  const urlId = `${id}-url`;
  const commentId = `${id}-comment`;
  const [url, setUrl] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyCopy, setBusyCopy] = useState(CONVERTING_COPY);
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
    const link = parseSharedLink(url);
    if (!link) {
      setLinkError(INVALID_LINK);
      return;
    }
    if (!commentCheck.ok) {
      return;
    }
    // A Bandcamp or SoundCloud link is never converted (link-only-posts.md §5.1).
    setBusyCopy(link.type === 'platform' ? FETCHING_COPY : CONVERTING_COPY);

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
        <label htmlFor={urlId} className="text-sm font-medium">
          {linkLabel}
        </label>
        <input
          id={urlId}
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
          aria-describedby={`${urlId}-error`}
          className={`min-h-11 ${fieldClass(mixtape, linkError !== null)}`}
        />
        <p id={`${urlId}-error`} aria-live="polite" className="text-xs text-danger empty:hidden">
          {linkError}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor={commentId} className="text-sm font-medium">
            Comment <span className="font-normal text-muted">(optional)</span>
          </label>
          <span className="text-xs text-muted" aria-hidden="true">
            {graphemeCount(cleanPostComment(comment))}/{COMMENT_MAX_GRAPHEMES}
          </span>
        </div>
        <textarea
          id={commentId}
          rows={2}
          value={comment}
          readOnly={busy}
          maxLength={4000}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={commentError !== null}
          aria-describedby={`${commentId}-error`}
          className={`py-3 ${fieldClass(mixtape, commentError !== null)}`}
        />
        <p
          id={`${commentId}-error`}
          aria-live="polite"
          className="text-xs text-danger empty:hidden"
        >
          {commentError}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* The signature wait (ui-redesign.md §3.7): the reels spin above the progress copy. */}
      {mixtape && busy && <ReelCassette spinning className="mx-auto w-20" />}

      <Button
        type="submit"
        busy={busy}
        offline={mixtape && !online}
        disabled={!online || url.trim() === '' || commentError !== null}
      >
        {busy ? busyCopy : submitLabel}
      </Button>
    </form>
  );
}
