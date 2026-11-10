import { useState } from 'react';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import { NavLink, Outlet } from 'react-router-dom';

import {
  listAdminCommunities,
  listAdminUsers,
  removeUserPhoto,
  type AdminCommunity,
  type AdminUser,
} from '../api/admin';
import { DesignSwitch } from '../components/DesignSwitch';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { PILL_TRACK, pillTrackOptionClass } from '../components/ui/PillTrack';
import { Sheet } from '../components/ui/Sheet';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useForbiddenEndsAdmin } from '../hooks/useForbiddenEndsAdmin';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import { useMixtape } from '../stores/design';
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

/** A list of rows: separate cards under Current, one `surface` card of divider rows under Mixtape (§5.17). */
function listClass(mixtape: boolean): string {
  return mixtape
    ? 'flex flex-col divide-y divide-line rounded-[22px] bg-surface px-4'
    : 'flex flex-col gap-3';
}

function rowClass(mixtape: boolean): string {
  return mixtape
    ? 'flex items-center gap-3 py-3'
    : 'flex items-center gap-3 rounded-2xl border border-line bg-surface p-3';
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The Admin screen — docs/features/admin-panel.md §5.2. Reached only through
 * AdminOnly; its tabs are routes, so each list has its own URL.
 */
export function AdminLayout() {
  const mixtape = useMixtape();
  return (
    <ScreenLayout>
      {mixtape && <TopBar />}
      <h1 className={`mb-4 ${mixtape ? MIXTAPE_H1 : 'font-display text-2xl font-medium'}`}>
        Admin
      </h1>
      {/* Both designs: it is how this device moves between them (ui-redesign.md §4). */}
      <DesignSwitch />
      <nav
        aria-label="Admin sections"
        className={`mb-6 ${mixtape ? PILL_TRACK : 'flex gap-1 rounded-full bg-line p-1'}`}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              mixtape
                ? // The pill track's look (§5.17): the current section on tape paper.
                  `flex items-center justify-center ${pillTrackOptionClass(isActive)}`
                : `flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-medium ${
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
  /** Rows changed here (a photo removed), by id, over the loaded list. */
  const [changed, setChanged] = useState<Record<string, AdminUser>>({});
  const mixtape = useMixtape();

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
      <ul className={listClass(mixtape)}>
        {users.data.map((user) => (
          <UserRow
            key={user.id}
            mixtape={mixtape}
            user={changed[user.id] ?? user}
            onChange={(updated) => setChanged((rows) => ({ ...rows, [updated.id]: updated }))}
          />
        ))}
      </ul>
    </section>
  );
}

function UserRow({
  user,
  mixtape,
  onChange,
}: {
  user: AdminUser;
  mixtape: boolean;
  onChange: (user: AdminUser) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const details = [
    user.preferredService ? streamingServiceLabel(user.preferredService) : null,
    `Joined ${formatDate(user.createdAt)}`,
    countLabel(user.communityCount, 'community', 'communities'),
  ].filter(Boolean);

  return (
    <li className={rowClass(mixtape)}>
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
      {user.profilePictureUrl && (
        <Button variant="secondary" onClick={() => setRemoving(true)} className="shrink-0 px-4">
          Remove photo
        </Button>
      )}
      {removing && (
        <RemovePhotoSheet user={user} onClose={() => setRemoving(false)} onRemoved={onChange} />
      )}
    </li>
  );
}

/** The admin removes a user's photo — docs/features/avatar-upload.md §5.2. */
function RemovePhotoSheet({
  user,
  onClose,
  onRemoved,
}: {
  user: AdminUser;
  onClose: () => void;
  onRemoved: (user: AdminUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const name = user.displayName ?? 'this user';

  async function remove() {
    setBusy(true);
    try {
      onRemoved(await removeUserPhoto(user.id));
      toast.success('Photo removed');
      onClose();
    } catch (caught) {
      const message = isAxiosError<{ message?: string }>(caught)
        ? caught.response?.data?.message
        : undefined;
      toast.error(message ?? "Couldn't remove the photo. Try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Remove photo?" onClose={onClose} dismissible={!busy}>
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          Remove {name}&apos;s photo? They&apos;ll see their initials instead.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" disabled={busy} onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void remove()} className="flex-1">
            Remove photo
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function AdminCommunities() {
  const communities = useRequest(listAdminCommunities);
  const forbidden = useForbiddenEndsAdmin(communities);
  const mixtape = useMixtape();

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
    if (mixtape) {
      return <EmptyState>No communities yet.</EmptyState>;
    }
    return <p className="py-10 text-center text-sm text-muted">No communities yet.</p>;
  }

  return (
    <section aria-label="Communities">
      <p className="mb-3 text-sm text-muted">
        {countLabel(communities.data.length, 'community', 'communities')}
      </p>
      <ul className={listClass(mixtape)}>
        {communities.data.map((community) => (
          <CommunityRow key={community.id} community={community} mixtape={mixtape} />
        ))}
      </ul>
    </section>
  );
}

function CommunityRow({ community, mixtape }: { community: AdminCommunity; mixtape: boolean }) {
  const owner = community.owner
    ? `Owner: ${community.owner.displayName ?? 'Not finished signing up'}`
    : 'No owner';

  return (
    <li className={rowClass(mixtape)}>
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
