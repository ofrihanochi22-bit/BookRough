import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

import { getPost, type PostsPage, type PublicPost } from '../api/posts';
import {
  archiveRecommendation,
  countArchived,
  countUnchecked,
  listArchived,
  listReceived,
  listSent,
  listUnchecked,
  markChecked,
  markRecommendationsSeen,
  unarchiveRecommendation,
  unmarkChecked,
} from '../api/recommendations';
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
  ARCHIVE_EMPTY_BODY,
  ARCHIVE_EMPTY_TITLE,
  ARCHIVE_FAILED,
  ARCHIVE_LOAD_FAILED,
  ARCHIVED,
  archivedRow,
  CHECK_FAILED,
  CHECKED,
  COMMUNITY_EMPTY_BODY,
  COMMUNITY_EMPTY_TITLE,
  COMMUNITY_LOAD_FAILED,
  communityPill,
  LOAD_FAILED,
  OFFLINE,
  UNARCHIVE_FAILED,
  UNARCHIVED,
  UNDO_FAILED,
} from '../lib/recommendationCopy';
import { type StreamingService, useAuthStore } from '../stores/auth';

import { useFriendRequests } from '../stores/friendRequests';

/** The three pills, plus the archive, which opens from inside Received. */
type Pill = 'received' | 'sent' | 'community';
type View = Pill | 'archived';

const EMPTY_TITLE: Record<View, string> = {
  received: 'Nothing here yet',
  sent: "You haven't sent anything",
  community: COMMUNITY_EMPTY_TITLE,
  archived: ARCHIVE_EMPTY_TITLE,
};

const EMPTY_BODY: Record<View, string> = {
  received: 'Songs your friends send you appear here.',
  sent: 'Send a friend a song from the button above.',
  community: COMMUNITY_EMPTY_BODY,
  archived: ARCHIVE_EMPTY_BODY,
};

const LOAD_FAILED_COPY: Record<View, string> = {
  received: LOAD_FAILED,
  sent: LOAD_FAILED,
  community: COMMUNITY_LOAD_FAILED,
  archived: ARCHIVE_LOAD_FAILED,
};

interface Community {
  id: string;
  name: string;
}

/** A page of any of the four lists; only From communities names each post's community. */
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
  archived: withoutCommunities(listArchived),
};

const CACHE_KEYS: Record<View, string> = {
  received: cacheKeys.recsReceived,
  sent: cacheKeys.recsSent,
  community: cacheKeys.recsCommunity,
  archived: cacheKeys.recsArchived,
};

/** A toast with an Undo button, as Mark checked and Archive show it. */
function undoToast(message: string, onUndo: () => void) {
  toast(
    (shown) => (
      <span className="flex items-center gap-3">
        {message}
        <button
          type="button"
          className="min-h-11 px-2 font-semibold underline"
          onClick={() => {
            toast.dismiss(shown.id);
            onUndo();
          }}
        >
          Undo
        </button>
      </span>
    ),
    { duration: 6000 },
  );
}

/** Changes made on this list since its first page loaded. */
interface LocalChanges {
  page: ListPage;
  /** Archived, unarchived, deleted, checked or found gone here. */
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
  /** This list's count (From communities, or the archive) is stale. */
  onCountChanged: () => void;
}

/** One of the four lists, newest first, with Load more and its own loading states. */
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

  /** Undo of Mark checked or Archive: the post goes back on the server and in place here. */
  async function undo(postId: string, write: (postId: string) => Promise<void>) {
    try {
      await write(postId);
      restore(postId);
    } catch {
      toast.error(UNDO_FAILED);
    }
    onCountChanged();
  }

  /**
   * The card goes at once and the write follows; it comes back if the write
   * fails. A 404 means the post is gone for the caller, so leaving it out is
   * right. Returns whether the write landed.
   */
  async function removeWith(
    post: PublicPost,
    write: (postId: string) => Promise<void>,
    failed: string,
  ): Promise<boolean> {
    remove(post.id);
    try {
      await write(post.id);
    } catch (caught) {
      if (!(isAxiosError(caught) && caught.response?.status === 404)) {
        restore(post.id);
        toast.error(failed);
        return false;
      }
      onCountChanged();
      return false;
    }
    onCountChanged();
    return true;
  }

  /** Mark checked (community-unchecked.md §5): the card goes at once, with Undo. */
  async function check(post: PublicPost) {
    if (await removeWith(post, markChecked, CHECK_FAILED)) {
      undoToast(CHECKED, () => void undo(post.id, unmarkChecked));
    }
  }

  /** Archive (archive-recommendations.md §5): out of Received at once, with Undo. */
  async function archive(post: PublicPost) {
    if (await removeWith(post, archiveRecommendation, ARCHIVE_FAILED)) {
      undoToast(ARCHIVED, () => void undo(post.id, unarchiveRecommendation));
    }
  }

  /** Unarchive: back in Received. Archiving it again is the undo, so no button. */
  async function unarchive(post: PublicPost) {
    if (await removeWith(post, unarchiveRecommendation, UNARCHIVE_FAILED)) {
      toast.success(UNARCHIVED);
    }
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
        <LoadError message={LOAD_FAILED_COPY[view]} onRetry={first.reload} />
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
              {...(view === 'received' && { onRate: setRating, onArchive: archive })}
              {...(view === 'archived' && { onRate: setRating, onUnarchive: unarchive })}
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
  const [pill, setPill] = useState<Pill>('received');
  // The archive opens from Received; switching pills or leaving the screen closes it.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const view: View = pill === 'received' && archiveOpen ? 'archived' : pill;
  const [sending, setSending] = useState(false);
  // A send reloads Sent, so the list always matches the server.
  const [sends, setSends] = useState(0);
  const unchecked = useRequest(countUnchecked, { key: cacheKeys.recsCommunityCount });
  const archivedCount = useRequest(countArchived, { key: cacheKeys.recsArchivedCount });
  const archived = archivedCount.status === 'ready' ? archivedCount.data : 0;
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

        <PillTrack
          label="Which list"
          options={views}
          value={pill}
          onChange={(next) => {
            setPill(next);
            setArchiveOpen(false);
          }}
        />

        {view === 'received' && archived > 0 && (
          <Button variant="secondary" onClick={() => setArchiveOpen(true)} className="w-full">
            {archivedRow(archived)}
          </Button>
        )}

        {view === 'archived' && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setArchiveOpen(false)}
              className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-muted"
            >
              ← Received
            </button>
            <h2 className="text-lg font-semibold">Archived</h2>
          </div>
        )}

        <RecommendationList
          key={view === 'sent' ? `sent-${sends}` : view}
          view={view}
          online={online}
          viewerService={viewerService}
          onCountChanged={view === 'community' ? unchecked.reload : archivedCount.reload}
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
