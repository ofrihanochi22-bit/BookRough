import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getPost, type PostsPage, type PublicPost } from '../api/posts';
import { listReceived, listSent, markRecommendationsSeen } from '../api/recommendations';
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
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { LOAD_FAILED, OFFLINE } from '../lib/recommendationCopy';
import { type StreamingService, useAuthStore } from '../stores/auth';
import { useMixtape } from '../stores/design';

import { useFriendRequests } from '../stores/friendRequests';

type View = 'received' | 'sent';

const EMPTY_TITLE: Record<View, string> = {
  received: 'Nothing here yet',
  sent: "You haven't sent anything",
};

const EMPTY_BODY: Record<View, string> = {
  received: 'Songs your friends send you appear here.',
  sent: 'Send a friend a song from the button above.',
};

const VIEWS = [
  { value: 'received', label: 'Received' },
  { value: 'sent', label: 'Sent' },
] as const;

/** Changes made on this list since its first page loaded. */
interface LocalChanges {
  page: PostsPage;
  /** Hidden, deleted or found gone here. */
  removed: string[];
  replaced: Record<string, PublicPost>;
  more: PublicPost[];
  nextCursor: string | null;
}

function fresh(page: PostsPage): LocalChanges {
  return { page, removed: [], replaced: {}, more: [], nextCursor: page.nextCursor };
}

interface RecommendationListProps {
  view: View;
  online: boolean;
  viewerService: StreamingService | null;
}

/** One of the two lists, newest first, with Load more and its own loading states. */
function RecommendationList({ view, online, viewerService }: RecommendationListProps) {
  const first = useRequest(view === 'received' ? listReceived : listSent);
  const refreshCount = useFriendRequests((state) => state.refresh);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [rating, setRating] = useState<PublicPost | null>(null);
  const [hiding, setHiding] = useState<PublicPost | null>(null);
  const mixtape = useMixtape();

  const loaded = first.status === 'ready' ? first.data : null;
  const changes = loaded ? (local?.page === loaded ? local : fresh(loaded)) : null;
  const posts = changes
    ? [...changes.page.posts, ...changes.more]
        .filter((post) => !changes.removed.includes(post.id))
        .map((post) => changes.replaced[post.id] ?? post)
    : [];

  // Opening Received clears the count, once it has really been shown (§5.2).
  useEffect(() => {
    if (view === 'received' && loaded) {
      markRecommendationsSeen()
        .then(refreshCount)
        .catch(() => undefined);
    }
  }, [view, loaded, refreshCount]);

  /** Applied against the latest state, so a Load more landing meanwhile is kept. */
  function update(page: PostsPage, change: (current: LocalChanges) => Partial<LocalChanges>) {
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

  /** The sheet ends for several reasons; the server says what the card is now. */
  async function rated(postId: string) {
    setRating(null);
    try {
      replace((await getPost(postId)).post);
    } catch (caught) {
      if (isAxiosError(caught) && caught.response?.status === 404) {
        remove(postId);
      } else {
        first.reload();
      }
    }
  }

  async function loadMore() {
    if (!changes?.nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const load = view === 'received' ? listReceived : listSent;
      const next = await load(changes.nextCursor);
      update(changes.page, (current) => ({
        more: [...current.more, ...next.posts],
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
        </div>
      )}

      {first.status === 'error' && <LoadError message={LOAD_FAILED} onRetry={first.reload} />}

      {changes &&
        posts.length === 0 &&
        (mixtape ? (
          <KitEmptyState title={EMPTY_TITLE[view]}>{EMPTY_BODY[view]}</KitEmptyState>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">{EMPTY_TITLE[view]}</p>
            <p className="mt-1 text-sm text-muted">{EMPTY_BODY[view]}</p>
          </div>
        ))}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          viewerService={viewerService}
          online={online}
          onUpdated={replace}
          onStale={first.reload}
          onDeleted={remove}
          onBookmarkChanged={(postId, isBookmarked) => {
            const current = posts.find((item) => item.id === postId);
            if (current) {
              replace({ ...current, isBookmarked });
            }
          }}
          {...(view === 'received' && { onRate: setRating, onHide: setHiding })}
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
 * so that this stays a list of songs rather than a chat.
 */
export function Recommendations() {
  const online = useOnlineStatus();
  const viewerService = useAuthStore((state) => state.user?.preferredService ?? null);
  const [view, setView] = useState<View>('received');
  const [sending, setSending] = useState(false);
  // A send reloads Sent, so the list always matches the server.
  const [sends, setSends] = useState(0);
  const mixtape = useMixtape();

  return (
    <ScreenLayout>
      {mixtape ? (
        <>
          <TopBar back={{ to: '/friends', label: 'Friends' }} />
          <h1 className={`mb-4 break-words ${MIXTAPE_H1}`}>Recommendations</h1>
          {/* Its own full-width row: the screen's one primary (ui-redesign.md §5.5). */}
          <Button offline={!online} onClick={() => setSending(true)} className="mb-6 w-full">
            Send a song
          </Button>
        </>
      ) : (
        <>
          <Link
            to="/friends"
            className="-ml-2 mb-4 flex min-h-11 w-fit items-center px-2 text-sm text-muted"
          >
            ← Friends
          </Link>
          <div className="mb-6 flex items-center justify-between gap-3">
            <h1 className="min-w-0 break-words font-display text-2xl font-medium">
              Recommendations
            </h1>
            <Button disabled={!online} onClick={() => setSending(true)}>
              Send a song
            </Button>
          </div>
        </>
      )}

      <div className="flex flex-col gap-4">
        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {OFFLINE}
          </p>
        )}

        {mixtape ? (
          <PillTrack label="Which list" options={VIEWS} value={view} onChange={setView} />
        ) : (
          <div role="group" aria-label="Which list" className="flex gap-2">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
                className={`min-h-11 flex-1 rounded-full border text-sm font-medium ${
                  view === option.value
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line bg-surface'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <RecommendationList
          key={view === 'sent' ? `sent-${sends}` : view}
          view={view}
          online={online}
          viewerService={viewerService}
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
