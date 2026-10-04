import { type FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';

import { createPost, type PublicPost } from '../api/posts';
import {
  checkPostComment,
  cleanPostComment,
  COMMENT_MAX_GRAPHEMES,
  CONVERTING_COPY,
} from '../lib/postText';
import { INVALID_LINK, parseSupportedLink } from '../lib/supportedLinks';
import { graphemeCount } from '../lib/textRules';
import { Button } from './ui/Button';

interface PostComposerProps {
  communityId: string;
  online: boolean;
  onPosted: (post: PublicPost) => void;
  /** The community vanished or the caller was removed (404). */
  onGone: () => void;
}

const inputClass =
  'w-full rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent read-only:opacity-60';

const NETWORK_ERROR = "Couldn't post. Check your connection and try again.";

/**
 * Paste a link, optionally comment, Post — docs/features/posts-feed.md §5.2.
 * The request waits for the whole conversion, so the busy state is designed,
 * and the draft is never lost: it clears only once the post exists.
 */
export function PostComposer({ communityId, online, onPosted, onGone }: PostComposerProps) {
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
    try {
      const post = await createPost(communityId, { url: link.url, comment: commentCheck.value });
      setUrl('');
      setComment('');
      onPosted(post);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      const message = isAxiosError<{ message?: string }>(caught)
        ? caught.response?.data?.message
        : undefined;
      if (status === 404) {
        onGone();
      } else if (status === 422 && message) {
        setLinkError(message);
      } else {
        setError(NETWORK_ERROR);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Share a song"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="post-url" className="text-sm font-medium">
          Share a song or album
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
        {busy ? CONVERTING_COPY : 'Post'}
      </Button>
    </form>
  );
}
