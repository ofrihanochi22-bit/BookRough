import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { getPost, type PostWithCommunity, type PublicPost } from '../api/posts';
import { listPostRatings, type PublicPostRating } from '../api/ratings';
import { PostCard } from '../components/PostCard';
import { RatingSheet } from '../components/RatingSheet';
import { PersonLink } from '../components/PersonLink';
import { Button } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { relativeTime } from '../lib/postLinks';
import { RATINGS_FAILED } from '../lib/ratingCopy';
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

  function reloadAll() {
    loaded.reload();
    ratings.reload();
  }

  return (
    <ScreenLayout>
      {data ? (
        <Link
          to={`/communities/${data.community.id}`}
          className="-ml-2 mb-4 flex min-h-11 w-fit items-center px-2 text-sm text-muted"
        >
          ← {data.community.name}
        </Link>
      ) : (
        <div className="mb-4 min-h-11" />
      )}

      {loaded.status === 'loading' && (
        <div role="status" aria-label="Loading the post" className="flex flex-col gap-4">
          <Skeleton className="h-48" />
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
          onDeleted={() => navigate(`/communities/${data.community.id}`, { replace: true })}
          onBookmarkChanged={(_, isBookmarked) => replace({ ...post, isBookmarked })}
        />
      )}

      <section aria-label="Ratings" className="mt-6 flex flex-col gap-4">
        {summary && (
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
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <PersonLink
                    user={rating.rater}
                    label={rating.isMine ? 'You' : rating.rater.displayName}
                    className="text-sm font-medium"
                  />
                  <p className="text-sm font-medium">{rating.score}/10</p>
                  <time dateTime={rating.createdAt} className="text-xs text-muted">
                    {relativeTime(rating.createdAt)}
                  </time>
                </div>
                {rating.comment && (
                  <p className="whitespace-pre-line break-words text-sm">{rating.comment}</p>
                )}
                {rating.isMine && (
                  <Button
                    variant="secondary"
                    disabled={!online || !post}
                    onClick={() => setEditing(rating)}
                    className="self-start"
                  >
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
        />
      )}
    </ScreenLayout>
  );
}
