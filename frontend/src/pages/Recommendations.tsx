import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { getPost, type PostsPage, type PublicPost } from '../api/posts';
import {
  countUnchecked,
  listReceived,
  listSent,
  listUnchecked,
  markChecked,
  markRecommendationsSeen,
  unmarkChecked,
} from '../api/recommendations';
import { HideRecommendationSheet } from '../components/HideRecommendationSheet';
import { PostCard } from '../components/PostCard';
import { RatingSheet } from '../components/RatingSheet';
import { SendRecommendationSheet } from '../components/SendRecommendationSheet';
import { Button } from '../components/ui/Button';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { PillTrack } from '../components/ui/PillTrack';
import { LoadingHint } from '../components/ui/LoadingHint';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { cacheKeys } from '../lib/cacheKeys';
import {
  CHECK_FAILED,
  CHECKED,
  COMMUNITY_EMPTY_BODY,
  COMMUNITY_EMPTY_TITLE,
  COMMUNITY_LOAD_FAILED,
  communityPill,
  LOAD_FAILED,
  OFFLINE,
  UNDO_FAILED,
} from '../lib/recommendationCopy';
import { type StreamingService, useAuthStore } from '../stores/auth';

import { useFriendRequests } from '../stores/friendRequests';

type View = 'received' | 'sent' | 'community';

const EMPTY_TITLE: Record<View, string> = {
  received: 'Nothing here yet',
  sent: "You haven't sent anything",
  community: COMMUNITY_EMPTY_TITLE,
};

const EMPTY_BODY: Record<View, string> = {
  received: 'Songs your friends send you appear here.',
  sent: 'Send a friend a song from the button above.',
  community: COMMUNITY_EMPTY_BODY,
};

interface Community {
  id: string;
  name: string;
}

/** A page of any of the three lists; only From communities names each post's community. */
interface ListPage extends PostsPage {
  communities: Record<string, Community>;
}

async function loadCommunity(before?: string): Promise<ListPage> {
  const page = await listUnchecked(before);
  return {
    posts: page.items.map((item) => item.post),
    nextCursor: page.nextCursor,
    communities: Object.fromEntries(page.items.map((item) => [item.post.id, item.community])),
  };
}

function withoutCommunities(load: (before?: string) => Promise<PostsPage>) {
  return async (before?: string): Promise<ListPage> => ({
    ...(await load(before)),
    communities: {},
  });
}

const LOADERS: Record<View, (before?: string) => Promise<ListPage>> = {
  received: withoutCommunities(listReceived),
  sent: withoutCommunities(listSent),
  community: loadCommunity,
};

const CACHE_KEYS: Record<View, string> = {
  received: cacheKeys.recsReceived,
  sent: cacheKeys.recsSent,
  community: cacheKeys.recsCommunity,
};

/** Changes made on this list since its first page loaded. */
interface LocalChanges {
  page: ListPage;
  /** Hidden, deleted, checked or found gone here. */
  removed: string[];
  replaced: Record<string, PublicPost>;
  more: PublicPost[];
  communities: Record<string, Community>;
  nextCursor: string | null;
}

function fresh(page: ListPage): LocalChanges {
  return {
    page,
    removed: [],
    replaced: {},
    more: [],
    // A page persisted by an older version has no `communities` (client-cache.md §3.2).
    communities: page.communities ?? {},
    nextCursor: page.nextCursor,
  };
}

interface RecommendationListProps {
  view: View;
  online: boolean;
  viewerService: StreamingService | null;
  /** From communities changed here: its count is stale. */
  onCountChanged: () => void;
}

/** One of the three lists, newest first, with Load more and its own loading states. */
function RecommendationList({
  view,
  online,
  viewerService,
  onCountChanged,
}: RecommendationListProps) {
  const first = useRequest(LOADERS[view], { key: CACHE_KEYS[view], persist: true });
  const fromCommunities = view === 'community';
  const refreshCount = useFriendRequests((state) => state.refresh);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [rating, setRating] = useState<PublicPost | null>(null);
  const [hiding, setHiding] = useState<PublicPost | null>(null);

  const loaded = first.status === 'ready' ? first.data : null;
  const changes = loaded ? (local?.page === loaded ? local : fresh(loaded)) : null;
  const posts = changes
    ? [...changes.page.posts, ...changes.more]
        .filter((post) => !changes.removed.includes(post.id))
        .map((post) => changes.replaced[post.id] ?? post)
    : [];

  // Opening Received clears the count, once it has really been shown (§5.2).
  // Once per visit: a cached list followed by its fresh answer is one showing
  // (client-cache.md §5.1).
  const markedSeen = useRef(false);
  useEffect(() => {
    if (view === 'received' && loaded && !markedSeen.current) {
      markedSeen.current = true;
      markRecommendationsSeen()
        .then(refreshCount)
        .catch(() => undefined);
    }
  }, [view, loaded, refreshCount]);

  /** Applied against the latest state, so a Load more landing meanwhile is kept. */
  function update(page: ListPage, change: (current: LocalChanges) => Partial<LocalChanges>) {
    setLocal((previous) => {
      const current = previous?.page === page ? previous : fresh(page);
      return { ...current, ...change(current) };
    });
  }

  function replace(post: PublicPost) {
    if (loaded) {
      update(loaded, (current) => ({ replaced: { ...current.replaced, [post.id]: post } }));
    }
  }

  function remove(postId: string) {
    if (loaded) {
      update(loaded, (current) => ({ removed: [...current.removed, postId] }));
    }
  }

  function restore(postId: string) {
    if (loaded) {
      update(loaded, (current) => ({ removed: current.removed.filter((id) => id !== postId) }));
    }
  }

  /** Undo of Mark checked: the post goes back on the server and in place here. */
  async function undo(postId: string) {
    try {
      await unmarkChecked(postId);
      restore(postId);
    } catch {
      toast.error(UNDO_FAILED);
    }
    onCountChanged();
  }

  /** Mark checked (community-unchecked.md §5): the card goes at once, with Undo. */
  async function check(post: PublicPost) {
    remove(post.id);
    try {
      await markChecked(post.id);
    } catch (caught) {
      // Gone for the caller (deleted, or they were removed): leaving it out is right.
      if (!(isAxiosError(caught) && caught.response?.status === 404)) {
        restore(post.id);
        toast.error(CHECK_FAILED);
        return;
      }
      onCountChanged();
      return;
    }
    onCountChanged();
    toast(
      (shown) => (
        <span className="flex items-center gap-3">
          {CHECKED}
          <button
            type="button"
            className="min-h-11 px-2 font-semibold underline"
            onClick={() => {
              toast.dismiss(shown.id);
              void undo(post.id);
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 6000 },
    );
  }

  /** The sheet ends for several reasons; the server says what the card is now. */
  async function rated(postId: string) {
    setRating(null);
    try {
      const { post } = await getPost(postId);
      // A rating checks a community post on the server (§4), so it leaves this list.
      if (fromCommunities && post.myScore !== null) {
        remove(postId);
        onCountChanged();
      } else {
        replace(post);
      }
    } catch (caught) {
      if (isAxiosError(caught) && caught.response?.status === 404) {
        remove(postId);
      } else {
        first.reload();
      }
    }
  }

  function bookmarkChanged(postId: string, isBookmarked: boolean) {
    // Saving checks a community post on the server (§4).
    if (fromCommunities && isBookmarked) {
      remove(postId);
      onCountChanged();
      return;
    }
    const current = posts.find((item) => item.id === postId);
    if (current) {
      replace({ ...current, isBookmarked });
    }
  }

  async function loadMore() {
    if (!changes?.nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await LOADERS[view](changes.nextCursor);
      update(changes.page, (current) => ({
        more: [...current.more, ...next.posts],
        communities: { ...current.communities, ...next.communities },
        nextCursor: next.nextCursor,
      }));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {first.status === 'loading' && (
        <div role="status" aria-label="Loading recommendations" className="flex flex-col gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <LoadingHint />
        </div>
      )}

      {first.status === 'error' && (
        <LoadError
          message={fromCommunities ? COMMUNITY_LOAD_FAILED : LOAD_FAILED}
          onRetry={first.reload}
        />
      )}

      {changes && posts.length === 0 && (
        <KitEmptyState title={EMPTY_TITLE[view]}>{EMPTY_BODY[view]}</KitEmptyState>
      )}

      {posts.map((post) => {
        const community = changes?.communities[post.id];
        return (
          <div key={post.id} className="flex flex-col gap-1.5">
            {community && (
              <p className="px-1 text-xs text-muted">
                in{' '}
                <Link
                  to={`/communities/${community.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-ink"
                >
                  <bdi>{community.name}</bdi>
                </Link>
              </p>
            )}
            <PostCard
              post={post}
              viewerService={viewerService}
              online={online}
              onUpdated={replace}
              onStale={first.reload}
              onDeleted={remove}
              onBookmarkChanged={bookmarkChanged}
              {...(view === 'received' && { onRate: setRating, onHide: setHiding })}
              {...(fromCommunities && { onRate: setRating, onCheck: check })}
            />
          </div>
        );
      })}

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

      {rating && (
        <RatingSheet
          post={rating}
          online={online}
          onClose={() => setRating(null)}
          onDone={rated}
          onStale={() => {
            setRating(null);
            first.reload();
          }}
        />
      )}

      {hiding && (
        <HideRecommendationSheet
          post={hiding}
          onClose={() => setHiding(null)}
          onHidden={(postId) => {
            setHiding(null);
            remove(postId);
          }}
        />
      )}
    </div>
  );
}

/**
 * Recommendations — docs/features/direct-recommendations.md §5.2 (UC-20). What
 * friends sent you and what you sent them, as two lists; never one timeline,
 * so that this stays a list of songs rather than a chat. A third list holds the
 * community posts not yet checked (docs/features/community-unchecked.md §5).
 */
export function Recommendations() {
  const online = useOnlineStatus();
  const viewerService = useAuthStore((state) => state.user?.preferredService ?? null);
  const [view, setView] = useState<View>('received');
  const [sending, setSending] = useState(false);
  // A send reloads Sent, so the list always matches the server.
  const [sends, setSends] = useState(0);
  const unchecked = useRequest(countUnchecked, { key: cacheKeys.recsCommunityCount });
  const views = [
    { value: 'received', label: 'Received' },
    { value: 'sent', label: 'Sent' },
    {
      value: 'community',
      label: communityPill(unchecked.status === 'ready' ? unchecked.data : 0),
    },
  ] as const;

  return (
    <ScreenLayout>
      <TopBar back={{ to: '/friends', label: 'Friends' }} />
      <h1 className={`mb-4 break-words ${MIXTAPE_H1}`}>Recommendations</h1>
      {/* Its own full-width row: the screen's one primary (ui-redesign.md §5.5). */}
      <Button offline={!online} onClick={() => setSending(true)} className="mb-6 w-full">
        Send a song
      </Button>

      <div className="flex flex-col gap-4">
        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {OFFLINE}
          </p>
        )}

        <PillTrack label="Which list" options={views} value={view} onChange={setView} />

        <RecommendationList
          key={view === 'sent' ? `sent-${sends}` : view}
          view={view}
          online={online}
          viewerService={viewerService}
          onCountChanged={unchecked.reload}
        />
      </div>

      {sending && (
        <SendRecommendationSheet
          online={online}
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            setSends((count) => count + 1);
          }}
        />
      )}
    </ScreenLayout>
  );
}
