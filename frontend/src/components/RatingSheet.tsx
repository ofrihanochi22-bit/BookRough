import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import type { PublicPost } from '../api/posts';
import { editRating, ratePost } from '../api/ratings';
import { checkPostComment, cleanPostComment, COMMENT_MAX_GRAPHEMES } from '../lib/postText';
import {
  ALREADY_RATED,
  RATE_FAILED,
  RATED,
  RATED_POST_DELETED,
  RATING_UPDATED,
  SCORES,
} from '../lib/ratingCopy';
import { displayTitle, pendingTitle } from '../lib/postLinks';
import { graphemeCount } from '../lib/textRules';
import { useMixtape } from '../stores/design';
import { Button } from './ui/Button';
import { fieldClass } from './ui/field';
import { Sheet } from './ui/Sheet';

interface RatingSheetProps {
  post: PublicPost;
  online: boolean;
  onClose: () => void;
  /** Rated, already rated, or gone: either way the song leaves My List. Edited: reload. */
  onDone: (postId: string) => void;
  /** Editing your own rating from Post Detail (post-detail.md §5.2): starts filled in. */
  editing?: { score: number; comment: string | null };
  /** While editing, the post or your access is gone (404). */
  onGone?: () => void;
  /** No longer allowed to rate (unfriended, direct-recommendations.md §6): reload. */
  onStale?: () => void;
}

const MAX_SCORE = SCORES.length;

function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(1, value));
}

/**
 * The Mixtape score: one row of ten stars — docs/features/ui-redesign.md §5.10.
 * Still a radiogroup of ten radios (star N = score N). A declared exception to
 * the 44px target rule, mitigated here: the stars run edge to edge with no
 * gaps, dragging a finger along the row sets the score continuously, arrow
 * keys move the choice, and the sheet shows the readout "N/10".
 */
function StarRow({
  score,
  disabled,
  onChange,
}: {
  score: number | null;
  disabled: boolean;
  onChange: (score: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  /** The star under a pointer's x position, from the row's own width. */
  function scoreAt(clientX: number): number | null {
    const box = row.current?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return null;
    }
    return clampScore(Math.floor(((clientX - box.left) / box.width) * MAX_SCORE) + 1);
  }

  function choose(value: number) {
    onChange(value);
    row.current?.querySelector<HTMLElement>(`[data-score="${value}"]`)?.focus();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    dragging.current = true;
    row.current?.setPointerCapture?.(event.pointerId);
    const value = scoreAt(event.clientX);
    if (value !== null) {
      choose(value);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) {
      return;
    }
    const value = scoreAt(event.clientX);
    if (value !== null && value !== score) {
      choose(value);
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    row.current?.releasePointerCapture?.(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = score ?? 0;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? clampScore(current + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? clampScore(current - 1)
          : event.key === 'Home'
            ? 1
            : event.key === 'End'
              ? MAX_SCORE
              : null;
    if (next !== null && !disabled) {
      event.preventDefault();
      choose(next);
    }
  }

  return (
    <div
      ref={row}
      role="radiogroup"
      aria-labelledby="rating-score-label"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      // The row runs edge to edge: the sheet's side padding is undone for it alone.
      className="-mx-5 flex touch-none select-none"
    >
      {SCORES.map((value) => {
        const filled = score !== null && value <= score;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            data-score={value}
            aria-checked={score === value}
            aria-label={`${value} out of 10`}
            // Roving focus: one tab stop, on the chosen star (or the first).
            tabIndex={(score ?? 1) === value ? 0 : -1}
            disabled={disabled}
            // A tap lands on the star under the finger; Enter / Space choose the focused star.
            onClick={() => onChange(value)}
            className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={`size-7 ${score === value ? 'mixtape-stick' : ''} ${
                filled ? 'fill-sticker stroke-sticker-ink' : 'fill-none stroke-line'
              }`}
              strokeWidth="1.5"
              strokeLinejoin="round"
              // Re-keyed per choice so the "stick" motion plays again.
              key={score === value ? `chosen-${value}` : value}
            >
              <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Rate & Review — docs/features/rate-post.md §5.2. A score from 1 to 10 and an
 * optional comment. Outcomes that end the song's stay on My List are toasts
 * (the sheet closes with them); problems the user can fix stay inline. With
 * `editing`, the same sheet edits your rating (post-detail.md §5.2).
 */
export function RatingSheet({
  post,
  online,
  onClose,
  onDone,
  editing,
  onGone,
  onStale,
}: RatingSheetProps) {
  const mixtape = useMixtape();
  const [score, setScore] = useState<number | null>(editing?.score ?? null);
  const [comment, setComment] = useState(editing?.comment ?? '');
  const title = editing ? 'Edit your rating' : 'Rate & Review';
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
      if (editing) {
        await editRating(post.id, { score, comment: commentCheck.value });
        toast.success(RATING_UPDATED);
      } else {
        await ratePost(post.id, { score, comment: commentCheck.value });
        toast.success(RATED);
      }
      onDone(post.id);
    } catch (caught) {
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      if (editing && response?.status === 404) {
        onGone?.();
      } else if (response?.status === 404) {
        toast.error(RATED_POST_DELETED);
        onDone(post.id);
      } else if (response?.status === 409) {
        toast.error(ALREADY_RATED);
        onDone(post.id);
      } else if (response?.status === 403) {
        toast.error(response.data?.message ?? RATE_FAILED);
        (onStale ?? onClose)();
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
    <Sheet title={title} onClose={onClose} dismissible={!busy}>
      <form aria-label={title} className="flex flex-col gap-4" onSubmit={submit}>
        <div>
          <p className="break-words font-medium">
            {post.conversionPending ? pendingTitle(post) : displayTitle(post)}
          </p>
          {post.artist && <p className="break-words text-sm text-muted">{post.artist}</p>}
        </div>

        {mixtape ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p id="rating-score-label" className="text-sm font-medium">
                Your score
              </p>
              <p
                aria-hidden="true"
                data-testid="score-readout"
                className="font-display text-3xl font-extrabold"
              >
                {score ?? '–'}
                <span className="text-lg text-muted">/10</span>
              </p>
            </div>
            <StarRow score={score} disabled={busy} onChange={setScore} />
          </div>
        ) : (
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
        )}

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
            className={`py-3 ${fieldClass(mixtape, commentError !== null)}`}
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
          variant="rating"
          busy={busy}
          offline={mixtape && !online}
          disabled={!online || score === null || commentError !== null}
        >
          {busy ? 'Submitting…' : editing ? 'Save changes' : 'Submit Rating'}
        </Button>
      </form>
    </Sheet>
  );
}
