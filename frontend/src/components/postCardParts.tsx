import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { deletePost, type PublicPost } from '../api/posts';
import { allLinks } from '../lib/postLinks';
import { deleteDirectBody } from '../lib/recommendationCopy';
import type { StreamingService } from '../stores/auth';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';

/** The post card's sheets (ui-redesign.md §5.0). */
export interface PostCardProps {
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
  /** On Received: rate a direct recommendation here (direct-recommendations.md §5.2). */
  onRate?: (post: PublicPost) => void;
  /** On Received: open the Hide confirmation. */
  onHide?: (post: PublicPost) => void;
}

const linkButton =
  'inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium';

const DELETE_FAILED = 'Could not delete post. Check your connection and try again.';

/** UC-18's confirmation; an admin deleting someone else's post is told the author won't know. */
export function DeletePostSheet({
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
          {post.direct
            ? deleteDirectBody(post.direct.recipient.displayName)
            : post.isMine
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

/** Every link the conversion found (posts-feed.md §5.3). */
export function OtherServicesSheet({ post, onClose }: { post: PublicPost; onClose: () => void }) {
  return (
    <Sheet title="Other services" onClose={onClose}>
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
  );
}
