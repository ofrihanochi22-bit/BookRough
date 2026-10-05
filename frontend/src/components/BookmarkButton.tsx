import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { removeBookmark, saveBookmark } from '../api/bookmarks';
import type { PublicPost } from '../api/posts';
import { ALREADY_RATED } from '../lib/ratingCopy';
import {
  NO_LONGER_AVAILABLE,
  REMOVE_FAILED,
  REMOVED,
  SAVE_FAILED,
  SAVED,
} from '../lib/bookmarkCopy';
import { BookmarkIcon } from './ui/BookmarkIcon';

interface BookmarkButtonProps {
  post: PublicPost;
  online: boolean;
  /** The server accepted the change. */
  onChanged: (postId: string, isBookmarked: boolean) => void;
  /** The post is gone for the caller (404) or already rated elsewhere (409): reload the feed. */
  onStale: () => void;
}

/**
 * Save to / remove from Listen Later — docs/features/bookmarks-my-list.md §5.1.
 * Optimistic (UC-12): the icon flips at once and reverts if the request fails.
 * Outcomes are toasts, which survive the feed reload a 404 triggers.
 */
export function BookmarkButton({ post, online, onChanged, onStale }: BookmarkButtonProps) {
  /** The value being sent; null when no request is in flight. */
  const [sending, setSending] = useState<boolean | null>(null);
  const saved = sending ?? post.isBookmarked;

  async function toggle() {
    if (sending !== null) {
      return;
    }
    const next = !saved;
    setSending(next);
    try {
      await (next ? saveBookmark(post.id) : removeBookmark(post.id));
      toast.success(next ? SAVED : REMOVED);
      onChanged(post.id, next);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (status === 404) {
        toast.error(NO_LONGER_AVAILABLE);
        onStale();
      } else if (status === 409) {
        // Rated in another tab: the reload brings "You rated n/10" instead.
        toast.error(ALREADY_RATED);
        onStale();
      } else {
        toast.error(next ? SAVE_FAILED : REMOVE_FAILED);
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <button
      type="button"
      aria-label={saved ? 'Remove from Listen Later' : 'Save to Listen Later'}
      aria-pressed={saved}
      disabled={!online}
      onClick={toggle}
      className={`flex size-11 items-center justify-center rounded-full disabled:opacity-50 ${
        saved ? 'text-accent' : 'text-muted'
      }`}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}
