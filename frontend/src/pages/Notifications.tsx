import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationsPage,
  type PublicNotification,
} from '../api/notifications';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { MIXTAPE_H1 } from '../components/ui/heading';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import {
  MARK_ALL_FAILED,
  MORE_FAILED,
  NOTIFICATIONS_LOAD_FAILED,
  NOTIFICATIONS_OFFLINE,
  viewOf,
} from '../lib/notificationCopy';
import { relativeTime } from '../lib/postLinks';
import { useMixtape } from '../stores/design';
import { useNotifications } from '../stores/notifications';

/** Changes made on this screen since the first page loaded. */
interface LocalChanges {
  page: NotificationsPage;
  more: PublicNotification[];
  nextCursor: string | null;
  /** Read here, one by one. */
  read: string[];
  /** Mark all as read succeeded. */
  allRead: boolean;
}

const EMPTY_TITLE = 'No notifications yet';
const EMPTY_BODY = 'When friends post, rate or send you something, it shows up here.';

function fresh(page: NotificationsPage): LocalChanges {
  return { page, more: [], nextCursor: page.nextCursor, read: [], allRead: false };
}

/**
 * The notification center — docs/features/notifications.md §5.4 (UC-21).
 * Newest activity first; tapping one marks it read and opens it; Mark all as
 * read reads the rest. Opening the screen changes nothing (D5).
 */
export function Notifications() {
  const first = useRequest(listNotifications);
  const online = useOnlineStatus();
  const unread = useNotifications((state) => state.unread);
  const setUnread = useNotifications((state) => state.setUnread);
  const readOne = useNotifications((state) => state.readOne);
  const [local, setLocal] = useState<LocalChanges | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const mixtape = useMixtape();

  // Local changes belong to the page they were made on; a reload starts over.
  const changes =
    first.status === 'ready' ? (local?.page === first.data ? local : fresh(first.data)) : null;
  const items = changes
    ? [...changes.page.items, ...changes.more].map((item) =>
        changes.allRead || changes.read.includes(item.id) ? { ...item, read: true } : item,
      )
    : [];
  const anyUnread = items.some((item) => !item.read) || (!changes?.allRead && unread > 0);

  function update(
    page: NotificationsPage,
    change: (current: LocalChanges) => Partial<LocalChanges>,
  ) {
    setLocal((previous) => {
      const current = previous?.page === page ? previous : fresh(page);
      return { ...current, ...change(current) };
    });
  }

  /**
   * Marks it read without waiting: the tap navigates at once. A failed call is
   * silent — the row stays unread on the server, and the badge corrects itself
   * on the next navigation.
   */
  function open(item: PublicNotification) {
    if (item.read || !online || !changes) {
      return;
    }
    update(changes.page, (current) => ({ read: [...current.read, item.id] }));
    readOne();
    markNotificationRead(item.id).catch(() => {});
  }

  async function markAll() {
    if (!changes) {
      return;
    }
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      update(changes.page, () => ({ allRead: true }));
      setUnread(0);
    } catch {
      toast.error(MARK_ALL_FAILED);
    } finally {
      setMarkingAll(false);
    }
  }

  async function loadMore() {
    if (!changes?.nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await listNotifications(changes.nextCursor);
      update(changes.page, (current) => ({
        more: [...current.more, ...next.items],
        nextCursor: next.nextCursor,
      }));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const markAllButton = changes && items.length > 0 && (
    <Button
      variant="secondary"
      busy={markingAll}
      disabled={!online || !anyUnread}
      onClick={() => void markAll()}
      className="shrink-0 px-4"
    >
      Mark all as read
    </Button>
  );

  return (
    <ScreenLayout>
      {mixtape ? (
        <>
          <TopBar back={{ to: '/home', label: 'Home' }} />
          {/* Wraps rather than truncates if the chip and the heading cannot share a row. */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h1 className={`min-w-0 break-words ${MIXTAPE_H1}`}>Notifications</h1>
            {markAllButton}
          </header>
        </>
      ) : (
        <>
          <Link to="/home" className="mb-2 inline-flex min-h-11 items-center text-sm text-muted">
            <span aria-hidden="true" className="mr-1">
              ‹
            </span>
            Home
          </Link>
          <header className="mb-6 flex items-center justify-between gap-3">
            <h1 className="min-w-0 truncate font-display text-2xl font-medium">Notifications</h1>
            {markAllButton}
          </header>
        </>
      )}

      <div className="flex flex-col gap-2">
        {!online && (
          <p role="note" className="text-center text-xs text-muted">
            {NOTIFICATIONS_OFFLINE}
          </p>
        )}

        {first.status === 'loading' && (
          <div role="status" aria-label="Loading notifications" className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {first.status === 'error' && (
          <LoadError message={NOTIFICATIONS_LOAD_FAILED} onRetry={first.reload} />
        )}

        {changes &&
          items.length === 0 &&
          (mixtape ? (
            <KitEmptyState title={EMPTY_TITLE}>{EMPTY_BODY}</KitEmptyState>
          ) : (
            <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="font-medium">{EMPTY_TITLE}</p>
              <p className="mt-1 text-sm text-muted">{EMPTY_BODY}</p>
            </div>
          ))}

        {items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                {mixtape ? (
                  <MixtapeNotificationRow item={item} onOpen={open} />
                ) : (
                  <NotificationRow item={item} onOpen={open} />
                )}
              </li>
            ))}
          </ul>
        )}

        {changes?.nextCursor && (
          <div className="mt-2 flex flex-col items-center gap-2">
            {moreFailed && (
              <p role="alert" className="text-sm text-danger">
                {MORE_FAILED}
              </p>
            )}
            <Button variant="secondary" busy={loadingMore} onClick={() => void loadMore()}>
              {moreFailed ? 'Try again' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: PublicNotification;
  onOpen: (item: PublicNotification) => void;
}) {
  const view = viewOf(item);
  return (
    <Link
      to={view.to}
      onClick={() => onOpen(item)}
      className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 ${
        item.read ? 'border-line bg-surface' : 'border-accent bg-accent-soft'
      }`}
    >
      <Avatar
        id={item.actor.id}
        name={item.actor.displayName}
        pictureUrl={item.actor.profilePictureUrl}
        size={40}
        decorative
      />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{view.lead}</span>
        {view.rest}
        <span className="block text-xs text-muted">{relativeTime(item.at)}</span>
      </span>
      {!item.read && (
        <span className="size-2.5 shrink-0 rounded-full bg-accent">
          <span className="sr-only">Unread</span>
        </span>
      )}
    </Link>
  );
}

/**
 * A row under Mixtape (ui-redesign.md §5.8): unread is a raised `surface` card
 * in `ink` with an accent dot; read lies flat on `canvas`, in `muted`, with a
 * muted avatar.
 */
function MixtapeNotificationRow({
  item,
  onOpen,
}: {
  item: PublicNotification;
  onOpen: (item: PublicNotification) => void;
}) {
  const view = viewOf(item);
  return (
    <Link
      to={view.to}
      onClick={() => onOpen(item)}
      data-read={item.read || undefined}
      className={`flex min-h-14 items-center gap-3 rounded-[18px] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        item.read ? 'text-muted' : 'bg-surface text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]'
      }`}
    >
      <span className={`shrink-0 ${item.read ? 'opacity-60 grayscale' : ''}`}>
        <Avatar
          id={item.actor.id}
          name={item.actor.displayName}
          pictureUrl={item.actor.profilePictureUrl}
          size={40}
          decorative
        />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{view.lead}</span>
        {view.rest}
        <span className="block text-xs text-muted">{relativeTime(item.at)}</span>
      </span>
      {!item.read && (
        <span className="size-2.5 shrink-0 rounded-full bg-accent">
          <span className="sr-only">Unread</span>
        </span>
      )}
    </Link>
  );
}
