import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import type { PublicPost } from '../api/posts';
import { ratePost } from '../api/ratings';
import { checkPostComment, cleanPostComment, COMMENT_MAX_GRAPHEMES } from '../lib/postText';
import { ALREADY_RATED, RATE_FAILED, RATED, RATED_POST_DELETED, SCORES } from '../lib/ratingCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import { graphemeCount } from '../lib/textRules';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

interface RatingSheetProps {
  post: PublicPost;
  online: boolean;
  onClose: () => void;
  /** Rated, already rated, or gone: either way the song leaves My List. */
  onDone: (postId: string) => void;
}

const inputClass =
  'w-full rounded-xl border bg-surface px-4 text-base text-ink outline-none focus:border-accent read-only:opacity-60';

/**
 * Rate & Review — docs/features/rate-post.md §5.2. A score from 1 to 10 and an
 * optional comment. Outcomes that end the song's stay on My List are toasts
 * (the sheet closes with them); problems the user can fix stay inline.
 */
export function RatingSheet({ post, online, onClose, onDone }: RatingSheetProps) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentCheck = checkPostComment(comment);
  const commentError = commentCheck.ok ? null : commentCheck.message;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (score === null || !commentCheck.ok || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ratePost(post.id, { score, comment: commentCheck.value });
      toast.success(RATED);
      onDone(post.id);
    } catch (caught) {
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      if (response?.status === 404) {
        toast.error(RATED_POST_DELETED);
        onDone(post.id);
      } else if (response?.status === 409) {
        toast.error(ALREADY_RATED);
        onDone(post.id);
      } else if (response?.status === 403) {
        toast.error(response.data?.message ?? RATE_FAILED);
        onClose();
      } else if (response?.status === 422) {
        setBusy(false);
        setError(response.data?.message ?? RATE_FAILED);
      } else {
        setBusy(false);
        setError(RATE_FAILED);
      }
    }
  }

  return (
    <Sheet title="Rate & Review" onClose={onClose} dismissible={!busy}>
      <form aria-label="Rate & Review" className="flex flex-col gap-4" onSubmit={submit}>
        <div>
          <p className="break-words font-medium">
            {post.conversionPending
              ? `Shared from ${streamingServiceLabel(post.sourceService)}`
              : post.title}
          </p>
          {post.artist && <p className="break-words text-sm text-muted">{post.artist}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <p id="rating-score-label" className="text-sm font-medium">
            Your score
          </p>
          <div
            role="radiogroup"
            aria-labelledby="rating-score-label"
            className="grid grid-cols-5 gap-2"
          >
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={score === value}
                disabled={busy}
                onClick={() => setScore(value)}
                className={`min-h-11 rounded-xl border text-sm font-medium ${
                  score === value
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line bg-surface'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor="rating-comment" className="text-sm font-medium">
              Comment <span className="font-normal text-muted">(optional)</span>
            </label>
            <span className="text-xs text-muted" aria-hidden="true">
              {graphemeCount(cleanPostComment(comment))}/{COMMENT_MAX_GRAPHEMES}
            </span>
          </div>
          <textarea
            id="rating-comment"
            rows={3}
            value={comment}
            readOnly={busy}
            maxLength={4000}
            onChange={(event) => setComment(event.target.value)}
            aria-invalid={commentError !== null}
            aria-describedby="rating-comment-error"
            className={`py-3 ${inputClass} ${commentError ? 'border-danger' : 'border-line'}`}
          />
          <p
            id="rating-comment-error"
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

        <Button
          type="submit"
          busy={busy}
          disabled={!online || score === null || commentError !== null}
        >
          {busy ? 'Submitting…' : 'Submit Rating'}
        </Button>
      </form>
    </Sheet>
  );
}
