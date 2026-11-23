import { Link } from 'react-router-dom';

import { listMyCommunities } from '../api/communities';
import { CreateCommunityLink } from '../components/CreateCommunityLink';
import { LoadError } from '../components/ui/LoadError';
import { CommunityCover } from '../components/ui/CommunityCover';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { LoadingHint } from '../components/ui/LoadingHint';
import { Skeleton } from '../components/ui/Skeleton';
import { HEADER_ICON, SearchIconLink, TopBar } from '../components/ui/TopBar';
import { useRequest } from '../hooks/useRequest';
import { cacheKeys } from '../lib/cacheKeys';
import {
  COMMUNITIES_LOAD_FAILED,
  CREATE_COMMUNITY_PATH,
  memberCountLabel,
  NO_COMMUNITIES_BODY,
  NO_COMMUNITIES_TITLE,
} from '../lib/communityCopy';
import { roleLabel } from '../lib/communityRoles';
import { badgeText } from '../lib/friendCopy';
import { bellLabel } from '../lib/notificationCopy';
import { useNotifications } from '../stores/notifications';
import { BELL_GLYPH } from '../components/ui/appIcons';

/** The way into the notification center — notifications.md §5.1. */
function NotificationsBell() {
  const unread = useNotifications((state) => state.unread);
  return (
    <Link to="/notifications" aria-label={bellLabel(unread)} className={HEADER_ICON}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {BELL_GLYPH}
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-on-accent"
        >
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}

/**
 * Communities Dashboard, the home screen — docs/features/communities-create.md
 * §6.4. Lists the communities the user belongs to, alphabetically by name, in the
 * server's order (manual-test-fixes-1122.md §4). Layout
 * per docs/features/ui-redesign.md §5.1: a two-row header
 * (the logo, Search and the bell; then the heading), cassette
 * cards, and a dashed Create tile ending the list instead of a floating button.
 * The header sits outside the request states, so it shows in every state.
 */
export function Dashboard() {
  const communities = useRequest(listMyCommunities, { key: cacheKeys.communities, persist: true });

  return (
    <ScreenLayout>
      <header className="mb-6">
        <TopBar>
          <SearchIconLink />
          <NotificationsBell />
        </TopBar>
        {/* Sign out lives only at the bottom of My Profile — visible-sign-out.md §1 (2026-11-17). */}
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] break-words">
          Your communities
        </h1>
      </header>

      {communities.status === 'loading' && (
        <div role="status" aria-label="Loading your communities" className="flex flex-col gap-4">
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <LoadingHint />
        </div>
      )}

      {communities.status === 'error' && (
        <LoadError message={COMMUNITIES_LOAD_FAILED} onRetry={communities.reload} />
      )}

      {communities.status === 'ready' &&
        (communities.data.length === 0 ? (
          <KitEmptyState
            title={NO_COMMUNITIES_TITLE}
            action={<CreateCommunityLink className="mt-1" />}
          >
            {NO_COMMUNITIES_BODY}
          </KitEmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {communities.data.map((community) => (
              <li key={community.id}>
                <Link
                  to={`/communities/${community.id}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <CommunityCover
                    id={community.id}
                    name={community.name}
                    variant="card"
                    photoUrl={community.photoUrl}
                    label="text"
                    detail={
                      <>
                        {memberCountLabel(community.memberCount)}
                        {roleLabel(community.myRole) && ` · ${roleLabel(community.myRole)}`}
                      </>
                    }
                  />
                </Link>
              </li>
            ))}
            <li>
              <Link
                to={CREATE_COMMUNITY_PATH}
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-line text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  +
                </span>
                Create community
              </Link>
            </li>
          </ul>
        ))}
    </ScreenLayout>
  );
}
