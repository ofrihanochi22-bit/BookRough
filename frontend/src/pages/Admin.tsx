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
import { DeleteCommunitySheet, DeleteUserSheet } from '../components/AdminDeleteSheets';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { PILL_TRACK, pillTrackOptionClass } from '../components/ui/PillTrack';
import { Sheet } from '../components/ui/Sheet';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { LoadingHint } from '../components/ui/LoadingHint';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useForbiddenEndsAdmin } from '../hooks/useForbiddenEndsAdmin';
import { useRequest } from '../hooks/useRequest';
import { memberCountLabel } from '../lib/communityCopy';
import { formatDate } from '../lib/overviewCopy';
import { streamingServiceLabel } from '../lib/streamingServices';
import { NotFound } from './NotFound';

const TABS = [
  { to: '/admin/overview', label: 'Overview' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/communities', label: 'Communities' },
  { to: '/admin/settings', label: 'Settings' },
] as const;

/** A list of rows: one `surface` card of divider rows (ui-redesign.md §5.17). */
const LIST = 'flex flex-col divide-y divide-line rounded-[22px] bg-surface px-4';
const ROW = 'flex items-center gap-3 py-3';

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
      <TopBar />
      <h1 className={`mb-4 ${MIXTAPE_H1}`}>Admin</h1>
      <nav aria-label="Admin sections" className={`mb-6 ${PILL_TRACK}`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center justify-center ${pillTrackOptionClass(isActive)}`
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
      <LoadingHint />
    </div>
  );
}

export function AdminUsers() {
  const users = useRequest(listAdminUsers);
  const forbidden = useForbiddenEndsAdmin(users);
  /** Rows changed here (a photo removed), by id, over the loaded list. */
  const [changed, setChanged] = useState<Record<string, AdminUser>>({});
  /** Rows deleted here (admin-delete.md §5), hidden from the loaded list. */
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());

  if (forbidden) {
    return <NotFound />;
  }
  if (users.status === 'loading') {
    return <ListSkeleton label="Loading users" />;
  }
  if (users.status === 'error') {
    return <LoadError message="Couldn't load the users." onRetry={users.reload} />;
  }

  const shown = users.data.filter((user) => !deleted.has(user.id));
  return (
    <section aria-label="Users">
      <p className="mb-3 text-sm text-muted">{countLabel(shown.length, 'user', 'users')}</p>
      <ul className={LIST}>
        {shown.map((user) => (
          <UserRow
            key={user.id}
            user={changed[user.id] ?? user}
            onChange={(updated) => setChanged((rows) => ({ ...rows, [updated.id]: updated }))}
            onDeleted={() => setDeleted((ids) => new Set(ids).add(user.id))}
          />
        ))}
      </ul>
    </section>
  );
}

function UserRow({
  user,
  onChange,
  onDeleted,
}: {
  user: AdminUser;
  onChange: (user: AdminUser) => void;
  onDeleted: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const details = [
    user.preferredService ? streamingServiceLabel(user.preferredService) : null,
    `Joined ${formatDate(user.createdAt)}`,
    countLabel(user.communityCount, 'community', 'communities'),
  ].filter(Boolean);

  return (
    <li className={ROW}>
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
      {/* No Delete on an admin's row, the caller's own included (admin-delete.md D4). */}
      {!user.isAdmin && (
        <Button variant="destructive" onClick={() => setDeleting(true)} className="shrink-0 px-4">
          Delete
        </Button>
      )}
      {removing && (
        <RemovePhotoSheet user={user} onClose={() => setRemoving(false)} onRemoved={onChange} />
      )}
      {deleting && (
        <DeleteUserSheet user={user} onClose={() => setDeleting(false)} onDeleted={onDeleted} />
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
  /** Rows deleted here (admin-delete.md §5), hidden from the loaded list. */
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());

  if (forbidden) {
    return <NotFound />;
  }
  if (communities.status === 'loading') {
    return <ListSkeleton label="Loading communities" />;
  }
  if (communities.status === 'error') {
    return <LoadError message="Couldn't load the communities." onRetry={communities.reload} />;
  }
  const shown = communities.data.filter((community) => !deleted.has(community.id));
  if (shown.length === 0) {
    return <EmptyState>No communities yet.</EmptyState>;
  }

  return (
    <section aria-label="Communities">
      <p className="mb-3 text-sm text-muted">
        {countLabel(shown.length, 'community', 'communities')}
      </p>
      <ul className={LIST}>
        {shown.map((community) => (
          <CommunityRow
            key={community.id}
            community={community}
            onDeleted={() => setDeleted((ids) => new Set(ids).add(community.id))}
          />
        ))}
      </ul>
    </section>
  );
}

function CommunityRow({
  community,
  onDeleted,
}: {
  community: AdminCommunity;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const owner = community.owner
    ? `Owner: ${community.owner.displayName ?? 'Not finished signing up'}`
    : 'No owner';

  return (
    <li className={ROW}>
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
      <Button variant="destructive" onClick={() => setDeleting(true)} className="shrink-0 px-4">
        Delete
      </Button>
      {deleting && (
        <DeleteCommunitySheet
          community={community}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </li>
  );
}
