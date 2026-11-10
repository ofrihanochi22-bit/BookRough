import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getPost, type PostWithCommunity, type PublicPost } from '../api/posts';
import { listPostRatings, type PublicPostRating } from '../api/ratings';
import { DiscussionSection, Thread } from '../components/Discussion';
import { PostCard } from '../components/PostCard';
import { RatingSheet } from '../components/RatingSheet';
import { PersonLink } from '../components/PersonLink';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { ScoreSticker } from '../components/ui/ScoreSticker';
import { Skeleton } from '../components/ui/Skeleton';
import { CHIP } from '../components/ui/chip';
import { TopBar } from '../components/ui/TopBar';
import { useDiscussion } from '../hooks/useDiscussion';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { relativeTime } from '../lib/postLinks';
import { RATINGS_FAILED } from '../lib/ratingCopy';
import { noLongerFriends } from '../lib/recommendationCopy';
import { useAuthStore } from '../stores/auth';
import { NotFound } from './NotFound';

/** A change made to the card on this screen, kept against the load it was made on. */
interface LocalPost {
  base: PostWithCommunity;
  post: PublicPost;
}

const isNotFound = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

/**
 * Post Detail — docs/features/post-detail.md §5.2 (UC-16). The card, the
 * average, and every member's rating; your own can be edited. The post and its
 * ratings load separately, so the card stays when the ratings fail.
 */
export function PostDetail() {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const viewerService = useAuthStore((state) => state.user?.preferredService ?? null);
  const loadPost = useCallback(() => getPost(postId), [postId]);
  const loadRatings = useCallback(() => listPostRatings(postId), [postId]);
  const loaded = useRequest(loadPost);
  const ratings = useRequest(loadRatings);
  const discussion = useDiscussion(postId);
  const [local, setLocal] = useState<LocalPost | null>(null);
  const [editing, setEditing] = useState<PublicPostRating | null>(null);
  // Access lost while here (the post deleted, or the viewer removed). Kept per id.
  const [goneId, setGoneId] = useState<string | null>(null);

  if (goneId === postId || (loaded.status === 'error' && isNotFound(loaded.error))) {
    return <NotFound />;
  }

  const data = loaded.status === 'ready' ? loaded.data : null;
  const post = data ? (local?.base === data ? local.post : data.post) : null;
  const summary =
    ratings.status === 'ready' ? ratings.data.ratingSummary : (post?.ratingSummary ?? null);

  function replace(next: PublicPost) {
    if (data) {
      setLocal({ base: data, post: next });
    }
  }

  const backPath = data?.community ? `/communities/${data.community.id}` : '/recommendations';

  function reloadAll() {
    loaded.reload();
    ratings.reload();
    discussion.state.reload();
  }

  // Writing on a direct item needs current friendship, like rating (discussion-threads.md §4).
  const canWrite = post !== null && post.direct?.isFriend !== false;
  const otherName = post?.direct
    ? (post.isMine ? post.direct.recipient : post.author).displayName
    : null;

  return (
    <ScreenLayout>
      <TopBar
        back={data ? { to: backPath, label: data.community?.name ?? 'Recommendations' } : undefined}
      />

      {loaded.status === 'loading' && (
        <div role="status" aria-label="Loading the post" className="flex flex-col gap-4">
          <Skeleton className="aspect-square w-full" />
        </div>
      )}

      {loaded.status === 'error' && (
        <LoadError message="Couldn't load this post." onRetry={loaded.reload} />
      )}

      {data && post && (
        <PostCard
          post={post}
          viewerService={viewerService}
          online={online}
          linkToDetail={false}
          onUpdated={replace}
          onStale={reloadAll}
          onDeleted={() => navigate(backPath, { replace: true })}
          onBookmarkChanged={(_, isBookmarked) => replace({ ...post, isBookmarked })}
        />
      )}

      <section aria-label="Ratings" className="mt-6 flex flex-col gap-4">
        {/* The large sticker carries the average (ui-redesign.md §5.3). */}
        <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Ratings</h2>
        {summary?.average === null && <p className="text-muted">No ratings yet</p>}

        {ratings.status === 'loading' && (
          <div role="status" aria-label="Loading ratings" className="flex flex-col gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {ratings.status === 'error' &&
          (isNotFound(ratings.error) ? null : (
            <LoadError message={RATINGS_FAILED} onRetry={ratings.reload} />
          ))}

        {ratings.status === 'ready' && ratings.data.ratings.length > 0 && (
          <ul className="flex flex-col gap-3">
            {ratings.data.ratings.map((rating) => (
              <li key={rating.id} className="flex flex-col gap-2 p-4 rounded-[22px] bg-surface">
                <div className="flex items-center gap-3">
                  <ScoreSticker score={rating.score} className="size-10 -rotate-6 text-base" />
                  <PersonLink
                    user={rating.rater}
                    label={rating.isMine ? 'You' : rating.rater.displayName}
                    className="text-sm font-medium"
                  />

                  <time dateTime={rating.createdAt} className="shrink-0 text-xs text-muted">
                    {relativeTime(rating.createdAt)}
                  </time>
                </div>
                {rating.comment && (
                  <p className="whitespace-pre-line break-words text-sm">{rating.comment}</p>
                )}
                {rating.isMine && post?.direct?.isFriend !== false && (
                  <button
                    type="button"
                    disabled={!online || !post}
                    onClick={() => setEditing(rating)}
                    className={`${CHIP} self-start ${online ? '' : 'border-dashed text-muted'}`}
                  >
                    Edit
                  </button>
                )}

                {/* A review opens a thread (discussion-threads.md D1). */}
                {/* Replies outlive a review emptied later; only a review takes new ones. */}
                {discussion.state.status === 'ready' &&
                  (rating.comment ||
                    discussion.repliesTo({ kind: 'review', ratingId: rating.id }).length > 0) && (
                    <Thread
                      opener={{ kind: 'review', ratingId: rating.id }}
                      openerAuthor={rating.rater}
                      online={online}
                      canWrite={canWrite && rating.comment !== null}
                      discussion={discussion}
                    />
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && post && (
        <DiscussionSection
          discussion={discussion}
          online={online}
          canWrite={canWrite}
          noLongerFriendsNote={!canWrite && otherName ? noLongerFriends(otherName) : null}
        />
      )}

      {editing && post && (
        <RatingSheet
          post={post}
          online={online}
          editing={{ score: editing.score, comment: editing.comment }}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reloadAll();
          }}
          onGone={() => setGoneId(postId)}
          onStale={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
    </ScreenLayout>
  );
}
