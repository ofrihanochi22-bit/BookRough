import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';

import { listPosts, type PostsPage, type PublicPost } from '../api/posts';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { useAuthStore } from '../stores/auth';
import { useMixtape } from '../stores/design';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { LineIcon } from './ui/LineIcon';
import { LoadError } from './ui/LoadError';
import { Skeleton } from './ui/Skeleton';

interface CommunityFeedProps {
  communityId: string;
  /** The caller lost access (removed, or the community deleted): show not-found. Stable. */
  onGone: () => void;
  /**
   * A post was just made to this community from the Share sheet
   * (ui-redesign.md §5.0b): a new value reloads the feed so it is on top. A
   * reload rather than a remount, so a draft in this screen's composer survives.
   */
  refreshKey?: number;
}

const FIRST_POST_TITLE = 'Share the first song';
const FIRST_POST_BODY =
  'Paste a link from Spotify, Apple Music, YouTube, Tidal, Deezer, Bandcamp or SoundCloud.';

/** Posts added or replaced on this screen since the first page loaded. */
interface LocalChanges {
  page: PostsPage;
  added: PublicPost[];
  replaced: Record<string, PublicPost>;
  /** Ids deleted on this screen, from whichever list held them. */
  deleted: string[];
  more: PublicPost[];
  nextCursor: string | null;
}

/**
 * The composer and the feed on a community's page — docs/features/posts-feed.md
 * §5.1. The first page loads with the screen; your own new post is prepended;
 * there is no live update of other people's posts.
 */
export function CommunityFeed({ communityId, onGone, refreshKey }: CommunityFeedProps) {
  const mixtape = useMixtape();
  const load = useCallback(() => listPosts(communityId), [communityId]);
  const first = useRequest(load);
  const { reload } = first;
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== seenRefreshKey.current) {
      seenRefreshKey.current = refreshKey;
      reload();
    }
  }, [refreshKey, reload]);
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
        ? {
            page: first.data,
            added: [],
            replaced: {},
            deleted: [],
            more: [],
            nextCursor: first.data.nextCursor,
          }
        : null;

  const posts = changes
    ? [...changes.added, ...changes.page.posts, ...changes.more]
        .filter((post) => !changes.deleted.includes(post.id))
        .map((post) => changes.replaced[post.id] ?? post)
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
          : { page, added: [], replaced: {}, deleted: [], more: [], nextCursor: page.nextCursor };
      return { ...current, ...change(current) };
    });
  }

  function onPosted(post: PublicPost) {
    if (changes) {
      update(changes.page, (current) => ({ added: [post, ...current.added] }));
    } else {
      // Posted while the feed was still loading or failed: reload it.
      first.reload();
    }
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

      {mixtape ? (
        <CollapsibleComposer
          communityId={communityId}
          online={online}
          onGone={onGone}
          onPosted={onPosted}
        />
      ) : (
        <PostComposer
          communityId={communityId}
          online={online}
          onGone={onGone}
          onPosted={onPosted}
        />
      )}

      {first.status === 'loading' && (
        <div role="status" aria-label="Loading posts" className="flex flex-col gap-4">
          <Skeleton className={mixtape ? 'h-56' : 'h-40'} />
          <Skeleton className={mixtape ? 'h-56' : 'h-40'} />
          {!mixtape && <Skeleton className="h-40" />}
        </div>
      )}

      {first.status === 'error' && (
        <LoadError message="Couldn't load posts." onRetry={first.reload} />
      )}

      {changes &&
        posts.length === 0 &&
        (mixtape ? (
          <EmptyState title={FIRST_POST_TITLE}>{FIRST_POST_BODY}</EmptyState>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">{FIRST_POST_TITLE}</p>
            <p className="mt-1 text-sm text-muted">{FIRST_POST_BODY}</p>
          </div>
        ))}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          viewerService={viewerService}
          online={online}
          onStale={first.reload}
          onDeleted={(postId) => {
            if (changes) {
              update(changes.page, (current) => ({ deleted: [...current.deleted, postId] }));
            }
          }}
          onBookmarkChanged={(postId, isBookmarked) => {
            if (changes) {
              update(changes.page, (current) => {
                const base =
                  current.replaced[postId] ??
                  [...current.added, ...current.page.posts, ...current.more].find(
                    (candidate) => candidate.id === postId,
                  );
                return base
                  ? { replaced: { ...current.replaced, [postId]: { ...base, isBookmarked } } }
                  : {};
              });
            }
          }}
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

interface CollapsibleComposerProps {
  communityId: string;
  online: boolean;
  onGone: () => void;
  onPosted: (post: PublicPost) => void;
}

/**
 * The Mixtape feed's composer (ui-redesign.md §5.2): a "Share a song or album"
 * pill that expands in place into the existing `PostComposer`, focus in the
 * link field. ✕ collapses it again; the composer stays mounted while hidden,
 * so the draft is kept while the screen is open. A post collapses it.
 */
function CollapsibleComposer({ communityId, online, onGone, onPosted }: CollapsibleComposerProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  // Focus moves only after a tap or a post, never on the first render.
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) {
      return;
    }
    moveFocus.current = false;
    if (open) {
      panel.current?.querySelector<HTMLInputElement>('input[type="url"]')?.focus();
    } else {
      pill.current?.focus();
    }
  }, [open]);

  function toggle(next: boolean) {
    moveFocus.current = true;
    setOpen(next);
  }

  return (
    <>
      {!open && (
        <button
          ref={pill}
          type="button"
          onClick={() => toggle(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-full bg-surface px-5 text-left text-sm font-medium text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LineIcon>
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
            <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </LineIcon>
          Share a song or album
        </button>
      )}
      <div ref={panel} hidden={!open} className="relative rounded-[22px] bg-surface p-4">
        <button
          type="button"
          aria-label="Close the composer"
          disabled={busy}
          onClick={() => toggle(false)}
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-muted disabled:opacity-50"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            ×
          </span>
        </button>
        <PostComposer
          communityId={communityId}
          online={online}
          onGone={onGone}
          onBusyChange={setBusy}
          bare
          onPosted={(post) => {
            onPosted(post);
            toggle(false);
          }}
        />
      </div>
    </>
  );
}
