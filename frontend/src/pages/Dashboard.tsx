import { Link } from 'react-router-dom';

import { listMyCommunities } from '../api/communities';
import { CreateCommunityLink } from '../components/CreateCommunityLink';
import { SignOutButton } from '../components/SignOutSheet';
import { LoadError } from '../components/ui/LoadError';
import { CommunityCover } from '../components/ui/CommunityCover';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { HEADER_ICON, SearchIconLink, TopBar } from '../components/ui/TopBar';
import { useRequest } from '../hooks/useRequest';
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
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
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
 * §6.4. Lists the communities the user belongs to, newest joined first. Layout
 * per docs/features/ui-redesign.md §5.1: a two-row header
 * (the logo, Search and the bell; then the heading and Sign out), cassette
 * cards, and a dashed Create tile ending the list instead of a floating button.
 * The header sits outside the request states, so it shows in every state.
 */
export function Dashboard() {
  const communities = useRequest(listMyCommunities);

  return (
    <ScreenLayout>
      <header className="mb-6">
        <TopBar>
          <SearchIconLink />
          <NotificationsBell />
        </TopBar>
        {/* Never truncated (§5.1): it fits at 375px, and wraps rather than clips if a font runs wide. */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 font-display text-2xl font-bold tracking-[-0.02em] break-words">
            Your communities
          </h1>
          {/* Sign-out where the app opens — visible-sign-out.md §5.1. */}
          <SignOutButton className="shrink-0 px-4" />
        </div>
      </header>

      {communities.status === 'loading' && (
        <div role="status" aria-label="Loading your communities" className="flex flex-col gap-4">
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
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
