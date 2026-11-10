import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getPost, type PostWithCommunity, type PublicPost } from '../api/posts';
import { listPostRatings, type PublicPostRating } from '../api/ratings';
import { DiscussionSection, Thread } from '../components/Discussion';
import { PostCard } from '../components/PostCard';
import { RatingSheet } from '../components/RatingSheet';
import { PersonLink } from '../components/PersonLink';
import { Button } from '../components/ui/Button';
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
import { useMixtape } from '../stores/design';
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
  const mixtape = useMixtape();
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
  const shownPost = data ? (local?.base === data ? local.post : data.post) : null;
  // Once the discussion is loaded, the card's count follows it (discussion-threads.md §5.2).
  const post =
    shownPost && discussion.state.status === 'ready'
      ? { ...shownPost, commentCount: discussion.comments.filter((c) => !c.deleted).length }
      : shownPost;
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
      {mixtape ? (
        <TopBar
          back={
            data ? { to: backPath, label: data.community?.name ?? 'Recommendations' } : undefined
          }
        />
      ) : data ? (
        <Link
          to={backPath}
          className="-ml-2 mb-4 flex min-h-11 w-fit items-center px-2 text-sm text-muted"
        >
          ← {data.community?.name ?? 'Recommendations'}
        </Link>
      ) : (
        <div className="mb-4 min-h-11" />
      )}

      {loaded.status === 'loading' && (
        <div role="status" aria-label="Loading the post" className="flex flex-col gap-4">
          <Skeleton className={mixtape ? 'aspect-square w-full' : 'h-48'} />
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
        {/* Under Mixtape the large sticker carries the average (ui-redesign.md §5.3). */}
        {mixtape && <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Ratings</h2>}
        {mixtape && summary?.average === null && <p className="text-muted">No ratings yet</p>}
        {!mixtape && summary && (
          <div className="flex items-baseline gap-2">
            {summary.average === null ? (
              <p className="text-muted">No ratings yet</p>
            ) : (
              <>
                <p className="font-display text-4xl font-medium">{summary.average}</p>
                <p className="text-sm text-muted">
                  out of 10 · {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
                </p>
              </>
            )}
          </div>
        )}

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
              <li
                key={rating.id}
                className={`flex flex-col gap-2 p-4 ${
                  mixtape
                    ? 'rounded-[22px] bg-surface'
                    : 'rounded-2xl border border-line bg-surface'
                }`}
              >
                <div className="flex items-center gap-3">
                  {mixtape && (
                    <ScoreSticker score={rating.score} className="size-10 -rotate-6 text-base" />
                  )}
                  <PersonLink
                    user={rating.rater}
                    label={rating.isMine ? 'You' : rating.rater.displayName}
                    className="text-sm font-medium"
                  />
                  {!mixtape && <p className="text-sm font-medium">{rating.score}/10</p>}
                  <time dateTime={rating.createdAt} className="shrink-0 text-xs text-muted">
                    {relativeTime(rating.createdAt)}
                  </time>
                </div>
                {rating.comment && (
                  <p className="whitespace-pre-line break-words text-sm">{rating.comment}</p>
                )}
                {rating.isMine && post?.direct?.isFriend !== false && mixtape && (
                  <button
                    type="button"
                    disabled={!online || !post}
                    onClick={() => setEditing(rating)}
                    className={`${CHIP} self-start ${online ? '' : 'border-dashed text-muted'}`}
                  >
                    Edit
                  </button>
                )}
                {rating.isMine && post?.direct?.isFriend !== false && !mixtape && (
                  <Button
                    variant="secondary"
                    disabled={!online || !post}
                    onClick={() => setEditing(rating)}
                    className="self-start"
                  >
                    Edit
                  </Button>
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
