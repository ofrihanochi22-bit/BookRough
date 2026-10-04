import { NavLink, Outlet } from 'react-router-dom';

import {
  listAdminCommunities,
  listAdminUsers,
  type AdminCommunity,
  type AdminUser,
} from '../api/admin';
import { Avatar } from '../components/ui/Avatar';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { useForbiddenEndsAdmin } from '../hooks/useForbiddenEndsAdmin';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import { NotFound } from './NotFound';

const TABS = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/communities', label: 'Communities' },
  { to: '/admin/settings', label: 'Settings' },
] as const;

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The Admin screen — docs/features/admin-panel.md §5.2. Reached only through
 * AdminOnly; its tabs are routes, so each list has its own URL.
 */
export function AdminLayout() {
  return (
    <ScreenLayout>
      <h1 className="mb-4 font-display text-2xl font-medium">Admin</h1>
      <nav aria-label="Admin sections" className="mb-6 flex gap-1 rounded-full bg-line p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-medium ${
                isActive ? 'bg-surface text-ink' : 'text-muted'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </ScreenLayout>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

export function AdminUsers() {
  const users = useRequest(listAdminUsers);
  const forbidden = useForbiddenEndsAdmin(users);

  if (forbidden) {
    return <NotFound />;
  }
  if (users.status === 'loading') {
    return <ListSkeleton label="Loading users" />;
  }
  if (users.status === 'error') {
    return <LoadError message="Couldn't load the users." onRetry={users.reload} />;
  }

  return (
    <section aria-label="Users">
      <p className="mb-3 text-sm text-muted">{countLabel(users.data.length, 'user', 'users')}</p>
      <ul className="flex flex-col gap-3">
        {users.data.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </ul>
    </section>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const details = [
    user.preferredService ? streamingServiceLabel(user.preferredService) : null,
    `Joined ${formatDate(user.createdAt)}`,
    countLabel(user.communityCount, 'community', 'communities'),
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <Avatar
        id={user.id}
        name={user.displayName}
        pictureUrl={user.profilePictureUrl}
        size={40}
        decorative
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-medium ${user.displayName ? '' : 'text-muted'}`}>
            {user.displayName ?? 'Not finished signing up'}
          </span>
          {user.isAdmin && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">
              Admin
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted">{details.join(' · ')}</p>
      </div>
    </li>
  );
}

export function AdminCommunities() {
  const communities = useRequest(listAdminCommunities);
  const forbidden = useForbiddenEndsAdmin(communities);

  if (forbidden) {
    return <NotFound />;
  }
  if (communities.status === 'loading') {
    return <ListSkeleton label="Loading communities" />;
  }
  if (communities.status === 'error') {
    return <LoadError message="Couldn't load the communities." onRetry={communities.reload} />;
  }
  if (communities.data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No communities yet.</p>;
  }

  return (
    <section aria-label="Communities">
      <p className="mb-3 text-sm text-muted">
        {countLabel(communities.data.length, 'community', 'communities')}
      </p>
      <ul className="flex flex-col gap-3">
        {communities.data.map((community) => (
          <CommunityRow key={community.id} community={community} />
        ))}
      </ul>
    </section>
  );
}

function CommunityRow({ community }: { community: AdminCommunity }) {
  const owner = community.owner
    ? `Owner: ${community.owner.displayName ?? 'Not finished signing up'}`
    : 'No owner';

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <Avatar id={community.id} name={community.name} size={40} decorative />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{community.name}</p>
        <p className="truncate text-xs text-muted">
          {[
            memberCountLabel(community.memberCount),
            `Created ${formatDate(community.createdAt)}`,
            owner,
          ].join(' · ')}
        </p>
      </div>
    </li>
  );
}
