import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { deletePost, type PublicPost, retryConversion } from '../api/posts';
import { allLinks, mainLink, relativeTime } from '../lib/postLinks';
import { CONVERTING_COPY } from '../lib/postText';
import { ratingSummaryLine } from '../lib/ratingCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import type { StreamingService } from '../stores/auth';
import { BookmarkButton } from './BookmarkButton';
import { PersonLink } from './PersonLink';
import { Button } from './ui/Button';
import { CoverArt } from './ui/CoverArt';
import { Sheet } from './ui/Sheet';

interface PostCardProps {
  post: PublicPost;
  viewerService: StreamingService | null;
  online: boolean;
  /** A retried post comes back converted (or still pending). */
  onUpdated: (post: PublicPost) => void;
  /** The post changed elsewhere (409) or is gone for the caller (404): reload the feed. */
  onStale: () => void;
  /** Deleted here, or found already deleted: drop it from the feed. */
  onDeleted: (postId: string) => void;
  /** Saved to or removed from Listen Later here. */
  onBookmarkChanged: (postId: string, isBookmarked: boolean) => void;
  /** False on Post Detail, which is where the link leads (post-detail.md §5.2). */
  linkToDetail?: boolean;
}

const linkButton =
  'inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium';

const DELETE_FAILED = 'Could not delete post. Check your connection and try again.';

/** UC-18's confirmation; an admin deleting someone else's post is told the author won't know. */
function DeletePostSheet({
  post,
  onClose,
  onDeleted,
  onStale,
}: {
  post: PublicPost;
  onClose: () => void;
  onDeleted: (postId: string) => void;
  onStale: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = post.author.displayName;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deletePost(post.id);
      toast.success('Post deleted');
      onDeleted(post.id);
    } catch (caught) {
      const response = isAxiosError<{ message?: string }>(caught) ? caught.response : undefined;
      if (response?.status === 404) {
        toast.success('This post was already deleted.');
        onDeleted(post.id);
        return;
      }
      if (response?.status === 403) {
        // No longer allowed (demoted meanwhile). A toast, not the sheet: the
        // reload that refreshes the menus unmounts this card and its sheet.
        toast.error(response.data?.message ?? DELETE_FAILED);
        onStale();
        return;
      }
      setBusy(false);
      setError(DELETE_FAILED);
    }
  }

  return (
    <Sheet title="Delete post" onClose={onClose} dismissible={!busy}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          {post.isMine
            ? 'Are you sure you want to delete this recommendation? This will also delete all ratings and comments associated with it.'
            : `Delete ${author}'s recommendation? This will also delete all ratings and comments on it. ${author} won't be notified.`}
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button onClick={confirm} busy={busy} className="flex-1">
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * One recommendation in the feed — docs/features/posts-feed.md §5.3. The main
 * button opens the viewer's own service; a pending post links to the original
 * and its author can try the conversion again. Its author and the
 * community's admins can delete it from the ⋯ menu (posts-delete.md §5).
 * Anyone else can save it to Listen Later (bookmarks-my-list.md §5.1) until
 * they rate it; then it shows their score (rate-post.md §5.3). The average and
 * View ratings lead to Post Detail (post-detail.md §5.1).
 */
export function PostCard({
  post,
  viewerService,
  online,
  onUpdated,
  onStale,
  onDeleted,
  onBookmarkChanged,
  linkToDetail = true,
}: PostCardProps) {
  const [showingLinks, setShowingLinks] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const main = mainLink(post, viewerService);
  const detailPath = `/posts/${post.id}`;
  const summary = ratingSummaryLine(post.ratingSummary);

  async function retry() {
    setRetrying(true);
    setRetryMessage(null);
    try {
      const updated = await retryConversion(post.id);
      if (updated.conversionPending) {
        setRetryMessage('Still unavailable. Try again later.');
      }
      onUpdated(updated);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (status === 404 || status === 409) {
        onStale();
      } else {
        setRetryMessage("Couldn't try again. Check your connection.");
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-3">
        <PersonLink
          user={post.author}
          label={post.isMine ? 'You' : post.author.displayName}
          className="text-sm font-medium"
        />
        <time dateTime={post.createdAt} className="text-xs text-muted">
          {relativeTime(post.createdAt)}
        </time>
        {post.myScore !== null ? (
          <p className="text-xs text-muted">You rated {post.myScore}/10</p>
        ) : (
          !post.isMine && (
            <BookmarkButton
              post={post}
              online={online}
              onChanged={onBookmarkChanged}
              onStale={onStale}
            />
          )
        )}
        {post.canDelete && (
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ⋯
            </span>
          </button>
        )}
      </header>
      {menuOpen && post.canDelete && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            disabled={!online}
            onClick={() => {
              setMenuOpen(false);
              setDeleting(true);
            }}
          >
            Delete post
          </Button>
        </div>
      )}

      <div className="flex gap-4">
        <CoverArt url={post.coverArtUrl} />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {post.conversionPending ? (
            <>
              <p className="font-medium">Shared from {streamingServiceLabel(post.sourceService)}</p>
              <p className="text-xs text-muted">Other services unavailable</p>
            </>
          ) : (
            <>
              <p className="break-words font-medium">
                {linkToDetail ? <Link to={detailPath}>{post.title}</Link> : post.title}
              </p>
              {post.artist && <p className="break-words text-sm text-muted">{post.artist}</p>}
              {post.kind === 'ALBUM' && (
                <p className="w-fit rounded-full border border-line px-2 text-xs text-muted">
                  Album
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {post.comment && <p className="whitespace-pre-line break-words text-sm">{post.comment}</p>}

      {(summary || linkToDetail) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{summary}</span>
          {linkToDetail && (
            <Link to={detailPath} className="flex min-h-11 items-center font-medium text-accent">
              View ratings
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={main.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkButton} bg-accent text-on-accent`}
        >
          Open in {main.label}
        </a>
        {!post.conversionPending && (
          <Button variant="secondary" onClick={() => setShowingLinks(true)}>
            Other services
          </Button>
        )}
        {post.conversionPending && post.isMine && (
          <Button variant="secondary" busy={retrying} disabled={!online} onClick={retry}>
            {retrying ? CONVERTING_COPY : 'Find on other services'}
          </Button>
        )}
      </div>
      {retryMessage && (
        <p role="status" className="text-xs text-muted">
          {retryMessage}
        </p>
      )}

      {deleting && (
        <DeletePostSheet
          post={post}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
          onStale={onStale}
        />
      )}

      {showingLinks && (
        <Sheet title="Other services" onClose={() => setShowingLinks(false)}>
          <ul className="flex flex-col gap-2">
            {allLinks(post).map((link) => (
              <li key={link.service}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkButton} w-full border border-line`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </article>
  );
}
