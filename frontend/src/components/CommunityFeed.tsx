import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';

import { listPosts, type PostsPage, type PublicPost } from '../api/posts';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { useAuthStore } from '../stores/auth';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { Button } from './ui/Button';
import { LoadError } from './ui/LoadError';
import { Skeleton } from './ui/Skeleton';

interface CommunityFeedProps {
  communityId: string;
  /** The caller lost access (removed, or the community deleted): show not-found. Stable. */
  onGone: () => void;
}

/** Posts added or replaced on this screen since the first page loaded. */
interface LocalChanges {
  page: PostsPage;
  added: PublicPost[];
  replaced: Record<string, PublicPost>;
  more: PublicPost[];
  nextCursor: string | null;
}

/**
 * The composer and the feed on a community's page — docs/features/posts-feed.md
 * §5.1. The first page loads with the screen; your own new post is prepended;
 * there is no live update of other people's posts.
 */
export function CommunityFeed({ communityId, onGone }: CommunityFeedProps) {
  const load = useCallback(() => listPosts(communityId), [communityId]);
  const first = useRequest(load);
  const online = useOnlineStatus();
  const viewerService = useAuthStore((state) => state.user?.preferredService ?? null);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const gone =
    first.status === 'error' && isAxiosError(first.error) && first.error.response?.status === 404;
  useEffect(() => {
    if (gone) {
      onGone();
    }
  }, [gone, onGone]);

  // Local changes belong to the page they were made on; a reload starts over.
  const changes =
    first.status === 'ready' && local?.page === first.data
      ? local
      : first.status === 'ready'
        ? { page: first.data, added: [], replaced: {}, more: [], nextCursor: first.data.nextCursor }
        : null;

  const posts = changes
    ? [...changes.added, ...changes.page.posts, ...changes.more].map(
        (post) => changes.replaced[post.id] ?? post,
      )
    : [];

  /**
   * Applies a change against the latest state, not the render that started the
   * action: a post takes seconds, and Load more or a retry may land meanwhile.
   * A change made against a page that has since been reloaded is dropped — the
   * reload already brought the server's version.
   */
  function update(page: PostsPage, change: (current: LocalChanges) => Partial<LocalChanges>) {
    setLocal((previous) => {
      const current =
        previous?.page === page
          ? previous
          : { page, added: [], replaced: {}, more: [], nextCursor: page.nextCursor };
      return { ...current, ...change(current) };
    });
  }

  async function loadMore() {
    if (!changes?.nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await listPosts(communityId, changes.nextCursor);
      update(changes.page, (current) => ({
        more: [...current.more, ...next.posts],
        nextCursor: next.nextCursor,
      }));
    } catch (caught) {
      if (isAxiosError(caught) && caught.response?.status === 404) {
        onGone();
      } else {
        setMoreFailed(true);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-label="Posts" className="mt-4 flex flex-col gap-4">
      {!online && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          You&apos;re offline. Connect to post.
        </p>
      )}

      <PostComposer
        communityId={communityId}
        online={online}
        onGone={onGone}
        onPosted={(post) => {
          if (changes) {
            update(changes.page, (current) => ({ added: [post, ...current.added] }));
          } else {
            // Posted while the feed was still loading or failed: reload it.
            first.reload();
          }
        }}
      />

      {first.status === 'loading' && (
        <div role="status" aria-label="Loading posts" className="flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {first.status === 'error' && (
        <LoadError message="Couldn't load posts." onRetry={first.reload} />
      )}

      {changes && posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-medium">Share the first song</p>
          <p className="mt-1 text-sm text-muted">
            Paste a link from Spotify, Apple Music, YouTube, Tidal or Deezer.
          </p>
        </div>
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          viewerService={viewerService}
          online={online}
          onStale={first.reload}
          onUpdated={(updated) => {
            if (changes) {
              update(changes.page, (current) => ({
                replaced: { ...current.replaced, [updated.id]: updated },
              }));
            }
          }}
        />
      ))}

      {changes?.nextCursor && (
        <div className="flex flex-col items-center gap-2">
          {moreFailed && (
            <p role="alert" className="text-sm text-danger">
              Couldn&apos;t load more posts.
            </p>
          )}
          <Button variant="secondary" busy={loadingMore} onClick={loadMore}>
            {moreFailed ? 'Try again' : 'Load more'}
          </Button>
        </div>
      )}
    </section>
  );
}
