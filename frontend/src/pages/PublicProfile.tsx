import { useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import type { Friendship } from '../api/friends';
import {
  getProfile,
  listProfileRatings,
  type ProfileData,
  type ProfileRating,
  type ProfileRatingsPage,
} from '../api/profiles';
import { FriendButton } from '../components/FriendButton';
import { SendRecommendationSheet } from '../components/SendRecommendationSheet';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { CoverArt } from '../components/ui/CoverArt';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { ProfileTape, TAPE_AVATAR_RING } from '../components/ui/ProfileTape';
import { ScoreSticker } from '../components/ui/ScoreSticker';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import { displayTitle, pendingTitle, relativeTime } from '../lib/postLinks';
import { PROFILE_FAILED, RATINGS_LOAD_FAILED, ratingsEmptyHint } from '../lib/profileCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import { useAuthStore } from '../stores/auth';

import { NotFound } from './NotFound';

/** Pages loaded with Load more, kept against the first page they followed. */
interface MorePages {
  first: ProfileRatingsPage;
  items: ProfileRating[];
  nextCursor: string | null;
}

const isNotFound = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

/**
 * Public User Profile — docs/features/find-people.md §5.2 (UC-5). The person,
 * and their ratings in communities the viewer is in. The profile and the
 * ratings load separately, so the header stays when the ratings fail.
 */
export function PublicProfile() {
  const { userId = '' } = useParams();
  const viewerId = useAuthStore((state) => state.user?.id);
  const loadProfile = useCallback(() => getProfile(userId), [userId]);
  const loadRatings = useCallback(() => listProfileRatings(userId), [userId]);
  const profile = useRequest(loadProfile);
  const ratings = useRequest(loadRatings);
  const [more, setMore] = useState<MorePages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // The friend button's answer, kept against the profile load it was made on.
  const [friendship, setFriendship] = useState<{ base: ProfileData; value: Friendship } | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const online = useOnlineStatus();
  // The page whose Load more failed, so the message never follows to another profile.
  const [moreFailed, setMoreFailed] = useState<ProfileRatingsPage | null>(null);

  if (userId === viewerId) {
    return <Navigate to="/profile" replace />;
  }
  if (profile.status === 'error' && isNotFound(profile.error)) {
    return <NotFound />;
  }

  const loadedProfile = profile.status === 'ready' ? profile.data : null;
  const user = loadedProfile?.user ?? null;
  const currentFriendship =
    loadedProfile && friendship?.base === loadedProfile
      ? friendship.value
      : (loadedProfile?.friendship ?? 'NONE');
  const first = ratings.status === 'ready' ? ratings.data : null;
  const extra = first && more?.first === first ? more : null;
  const items = first ? [...first.items, ...(extra?.items ?? [])] : [];
  const nextCursor = extra ? extra.nextCursor : (first?.nextCursor ?? null);
  const failed = first !== null && moreFailed === first;

  async function loadMore() {
    if (!first || !nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(null);
    try {
      const next = await listProfileRatings(userId, nextCursor);
      setMore((previous) => {
        const loaded = previous?.first === first ? previous.items : [];
        return { first, items: [...loaded, ...next.items], nextCursor: next.nextCursor };
      });
    } catch {
      setMoreFailed(first);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScreenLayout>
      <TopBar />
      {profile.status === 'loading' && (
        <div role="status" aria-label="Loading the profile" className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-8 flex-1" />
        </div>
      )}

      {profile.status === 'error' && (
        <LoadError message={PROFILE_FAILED} onRetry={profile.reload} />
      )}

      {loadedProfile && user && (
        <ProfileTape userId={user.id}>
          <header className="flex items-center gap-4">
            <span className={`shrink-0 ${TAPE_AVATAR_RING}`}>
              <Avatar
                id={user.id}
                name={user.displayName}
                pictureUrl={user.profilePictureUrl}
                size={76}
                decorative
              />
            </span>
            <div className="min-w-0">
              <h1 className={`break-words ${MIXTAPE_H1}`}>{user.displayName}</h1>
              <p className="text-sm text-muted">
                Listens on {streamingServiceLabel(user.preferredService)}
              </p>
            </div>
          </header>
        </ProfileTape>
      )}

      {loadedProfile && user && (
        // Half width each, or the full row for a single button (§5.6).
        <div className="mt-4 flex gap-3">
          <FriendButton
            userId={user.id}
            name={user.displayName}
            friendship={currentFriendship}
            online={online}
            onChanged={(value) => setFriendship({ base: loadedProfile, value })}
            onStale={profile.reload}
            className="flex-1 px-3"
          />
          {currentFriendship === 'FRIENDS' && (
            <Button
              offline={!online}
              disabled={!online}
              onClick={() => setSending(true)}
              className="flex-1 px-3"
            >
              Send a song
            </Button>
          )}
        </div>
      )}

      {sending && user && (
        <SendRecommendationSheet
          friend={user}
          online={online}
          onClose={() => setSending(false)}
          onSent={() => setSending(false)}
          onStale={profile.reload}
        />
      )}

      {profile.status !== 'error' && (
        <section aria-labelledby="profile-ratings" className="mt-8 flex flex-col gap-3">
          <h2 id="profile-ratings" className="font-display text-lg font-bold">
            Ratings
          </h2>

          {ratings.status === 'loading' && (
            <div role="status" aria-label="Loading ratings" className="flex flex-col gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          )}

          {ratings.status === 'error' && !isNotFound(ratings.error) && (
            <LoadError message={RATINGS_LOAD_FAILED} onRetry={ratings.reload} />
          )}

          {first && items.length === 0 && user && (
            <KitEmptyState title="No ratings to show" level={3}>
              {ratingsEmptyHint(user.displayName)}
            </KitEmptyState>
          )}

          {items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((rating) => (
                <li key={rating.id}>
                  <RatingRow rating={rating} />
                </li>
              ))}
            </ul>
          )}

          {nextCursor && (
            <div className="flex flex-col items-center gap-2">
              {failed && (
                <p role="alert" className="text-sm text-danger">
                  {RATINGS_LOAD_FAILED}
                </p>
              )}
              <Button variant="secondary" busy={loadingMore} onClick={loadMore}>
                {failed ? 'Try again' : 'Load more'}
              </Button>
            </div>
          )}
        </section>
      )}
    </ScreenLayout>
  );
}

/**
 * One rating (ui-redesign.md §5.6): a `surface` card linking to
 * Post Detail, a 64px cover with a small sticker disc carrying the score.
 */
function RatingRow({ rating }: { rating: ProfileRating }) {
  const { post } = rating;
  return (
    <Link
      to={`/posts/${encodeURIComponent(post.id)}`}
      className="flex gap-4 rounded-[22px] bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative shrink-0 self-start">
        <CoverArt url={post.coverArtUrl} size={64} />
        <ScoreSticker
          score={rating.score}
          className="absolute -top-2 -right-2 size-8 rotate-6 text-sm shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {post.conversionPending ? (
          <p className="font-display font-bold">{pendingTitle(post)}</p>
        ) : (
          <>
            <p className="truncate font-display font-bold">{displayTitle(post)}</p>
            <p className="truncate text-sm text-muted">{post.artist}</p>
          </>
        )}
        {rating.comment && (
          <p className="whitespace-pre-line break-words text-sm">{rating.comment}</p>
        )}
        <p className="text-xs text-muted">
          in {rating.community.name} ·{' '}
          <time dateTime={rating.createdAt}>{relativeTime(rating.createdAt)}</time>
        </p>
      </div>
    </Link>
  );
}
