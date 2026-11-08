import { Link } from 'react-router-dom';

import { listMyCommunities, type PublicCommunity } from '../api/communities';
import { SignOutButton } from '../components/SignOutSheet';
import { LoadError } from '../components/ui/LoadError';
import { CommunityCover } from '../components/ui/CommunityCover';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { roleLabel } from '../lib/communityRoles';
import { badgeText } from '../lib/friendCopy';
import { bellLabel } from '../lib/notificationCopy';
import { useNotifications } from '../stores/notifications';

const CREATE_PATH = '/communities/new';

/**
 * Communities Dashboard, the home screen — docs/features/communities-create.md
 * §6.4. Lists the communities the user belongs to, newest joined first.
 */
export function Dashboard() {
  const communities = useRequest(listMyCommunities);

  return (
    <ScreenLayout>
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate font-display text-2xl font-medium">Your communities</h1>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationsBell />
          {/* Sign-out where the app opens — visible-sign-out.md §5.1. */}
          <SignOutButton className="px-4" />
        </div>
      </header>

      {communities.status === 'loading' && (
        <div role="status" aria-label="Loading your communities" className="flex flex-col gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {communities.status === 'error' && (
        <LoadError message="Couldn't load your communities." onRetry={communities.reload} />
      )}

      {communities.status === 'ready' &&
        (communities.data.length === 0 ? (
          <EmptyState />
        ) : (
          <CommunityList items={communities.data} />
        ))}
    </ScreenLayout>
  );
}

/** The way into the notification center — notifications.md §5.1. */
function NotificationsBell() {
  const unread = useNotifications((state) => state.unread);
  return (
    <Link
      to="/notifications"
      aria-label={bellLabel(unread)}
      className="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface"
    >
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <h2 className="font-display text-xl font-medium">Start your first community</h2>
      <p className="max-w-xs text-sm text-muted">A community is where your friends share music.</p>
      <Link
        to={CREATE_PATH}
        className="mt-2 flex min-h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-on-accent"
      >
        Create community
      </Link>
    </div>
  );
}

function CommunityList({ items }: { items: PublicCommunity[] }) {
  return (
    <>
      {/* Bottom padding keeps the last card clear of the floating button. */}
      <ul className="flex flex-col gap-4 pb-16">
        {items.map((community) => (
          <li key={community.id}>
            <Link
              to={`/communities/${community.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              <CommunityCover id={community.id} name={community.name} variant="card" />
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="min-w-0 truncate font-medium">{community.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {memberCountLabel(community.memberCount)}
                  {roleLabel(community.myRole) && ` · ${roleLabel(community.myRole)}`}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Floats above the tab bar, aligned with the phone-width column on desktop. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mx-auto flex max-w-md justify-end px-6">
        <Link
          to={CREATE_PATH}
          className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent shadow-lg"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Create community
        </Link>
      </div>
    </>
  );
}
