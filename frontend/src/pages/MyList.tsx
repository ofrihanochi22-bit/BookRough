import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  listBookmarks,
  removeBookmark,
  type SavedPost,
  type SavedPostsPage,
} from '../api/bookmarks';
import { RatingSheet } from '../components/RatingSheet';
import { SavedPostCard } from '../components/SavedPostCard';
import { Button } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { REMOVE_FAILED, REMOVED } from '../lib/bookmarkCopy';
import { useAuthStore } from '../stores/auth';

/** Changes made on this screen since the first page loaded. */
interface LocalChanges {
  page: SavedPostsPage;
  /** Removed here (or being removed): hidden from whichever list holds them. */
  removed: string[];
  more: SavedPost[];
  nextCursor: string | null;
}

function fresh(page: SavedPostsPage): LocalChanges {
  return { page, removed: [], more: [], nextCursor: page.nextCursor };
}

/**
 * My List, the Listen Later queue — docs/features/bookmarks-my-list.md §5.2.
 * Newest saved first; songs from communities the viewer has left stay here.
 * Rate & Review opens the rating sheet (rate-post.md §5).
 */
export function MyList() {
  const first = useRequest(listBookmarks);
  const online = useOnlineStatus();
  const viewerService = useAuthStore((state) => state.user?.preferredService ?? null);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [rating, setRating] = useState<SavedPost | null>(null);

  // Local changes belong to the page they were made on; a reload starts over.
  const changes =
    first.status === 'ready' ? (local?.page === first.data ? local : fresh(first.data)) : null;
  const items = changes
    ? [...changes.page.items, ...changes.more].filter(
        (item) => !changes.removed.includes(item.post.id),
      )
    : [];

  /** Applied against the latest state, so a Load more landing meanwhile is kept. */
  function update(page: SavedPostsPage, change: (current: LocalChanges) => Partial<LocalChanges>) {
    setLocal((previous) => {
      const current = previous?.page === page ? previous : fresh(page);
      return { ...current, ...change(current) };
    });
  }

  /** Optimistic: the card leaves at once and comes back if the request fails. */
  async function remove(postId: string) {
    if (!changes) {
      return;
    }
    const { page } = changes;
    update(page, (current) => ({ removed: [...current.removed, postId] }));
    try {
      await removeBookmark(postId);
      toast.success(REMOVED);
    } catch {
      update(page, (current) => ({ removed: current.removed.filter((id) => id !== postId) }));
      toast.error(REMOVE_FAILED);
    }
  }

  /** Rated, already rated, or deleted: the song leaves the list (rate-post.md §5.2). */
  function rated(postId: string) {
    setRating(null);
    if (changes) {
      update(changes.page, (current) => ({ removed: [...current.removed, postId] }));
    }
  }

  async function loadMore() {
    if (!changes?.nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await listBookmarks(changes.nextCursor);
      update(changes.page, (current) => ({
        more: [...current.more, ...next.items],
        nextCursor: next.nextCursor,
      }));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScreenLayout>
      <h1 className="font-display text-2xl font-medium">My List</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Songs you saved to listen later.</p>

      <div className="flex flex-col gap-4">
        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            You&apos;re offline. Connect to change your list.
          </p>
        )}

        {first.status === 'loading' && (
          <div role="status" aria-label="Loading your list" className="flex flex-col gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        )}

        {first.status === 'error' && (
          <LoadError message="Couldn't load your list." onRetry={first.reload} />
        )}

        {changes && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted">
              Tap the bookmark on a friend&apos;s song to save it here.
            </p>
          </div>
        )}

        {items.map((item) => (
          <SavedPostCard
            key={item.post.id}
            saved={item}
            viewerService={viewerService}
            online={online}
            onRemove={remove}
            onRate={setRating}
          />
        ))}

        {changes?.nextCursor && (
          <div className="flex flex-col items-center gap-2">
            {moreFailed && (
              <p role="alert" className="text-sm text-danger">
                Couldn&apos;t load more songs.
              </p>
            )}
            <Button variant="secondary" busy={loadingMore} onClick={loadMore}>
              {moreFailed ? 'Try again' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      {rating && (
        <RatingSheet
          post={rating.post}
          online={online}
          onClose={() => setRating(null)}
          onDone={rated}
        />
      )}
    </ScreenLayout>
  );
}
