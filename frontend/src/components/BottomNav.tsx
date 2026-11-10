import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { badgeText } from '../lib/friendCopy';
import { useMixtape } from '../stores/design';
import { useFriendRequests } from '../stores/friendRequests';
import { useNotifications } from '../stores/notifications';
import { ShareSheet } from './ShareSheet';
import { BookmarkIcon } from './ui/BookmarkIcon';

interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const TABS: readonly Tab[] = [
  {
    to: '/home',
    label: 'Home',
    icon: (
      <Icon>
        <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
      </Icon>
    ),
  },
  {
    to: '/search',
    label: 'Search',
    icon: (
      <Icon>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </Icon>
    ),
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.6c1.6.7 2.8 2.2 3.5 4.4" />
      </Icon>
    ),
  },
  {
    to: '/my-list',
    label: 'My List',
    icon: <BookmarkIcon />,
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <Icon>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </Icon>
    ),
  },
];

/** Which tab carries which count, and how its accessible name says it. */
function badgeFor(to: string, requests: number, unread: number) {
  if (to === '/friends' && requests > 0) {
    return { count: requests, label: `${requests} waiting` };
  }
  if (to === '/home' && unread > 0) {
    return { count: unread, label: `${unread} unread` };
  }
  return null;
}

/** Mixtape drops Search from the bar (it moves to the Home and Friends headers). */
const MIXTAPE_LEFT = ['/home', '/friends'];
const MIXTAPE_RIGHT = ['/my-list', '/profile'];

function tabsFor(paths: readonly string[]): Tab[] {
  return paths.map((path) => TABS.find((tab) => tab.to === path)!);
}

function TabItem({
  tab,
  requests,
  unread,
  mixtape,
}: {
  tab: Tab;
  requests: number;
  unread: number;
  mixtape: boolean;
}) {
  const badge = badgeFor(tab.to, requests, unread);
  return (
    <li className="flex-1">
      <NavLink
        to={tab.to}
        aria-label={badge ? `${tab.label}, ${badge.label}` : undefined}
        className={({ isActive }) =>
          `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
            isActive ? 'text-accent' : 'text-muted'
          }${mixtape ? ' font-medium' : ''}`
        }
      >
        <span className="relative">
          {tab.icon}
          {badge && (
            <span
              aria-hidden="true"
              className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-on-accent"
            >
              {badgeText(badge.count)}
            </span>
          )}
        </span>
        {tab.label}
      </NavLink>
    </li>
  );
}

/**
 * The Mixtape tab bar — docs/features/ui-redesign.md §3.4: Home · Friends ·
 * Share · My List · Profile. Share is a raised accent button in the centre that
 * opens the Share sheet (§5.0b); the badges keep their meaning.
 */
function MixtapeNav({ requests, unread }: { requests: number; unread: number }) {
  const [sharing, setSharing] = useState(false);
  const online = useOnlineStatus();

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--line)]"
      >
        <ul className="mx-auto flex max-w-md items-end">
          {tabsFor(MIXTAPE_LEFT).map((tab) => (
            <TabItem key={tab.to} tab={tab} requests={requests} unread={unread} mixtape />
          ))}
          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setSharing(true)}
              aria-haspopup="dialog"
              className="flex min-h-14 flex-col items-center justify-end gap-0.5 text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden="true"
                className="-mt-5 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_4px_14px_rgb(0_0_0/0.25)] ring-4 ring-surface"
              >
                <Icon>
                  <path d="M12 5v14M5 12h14" />
                </Icon>
              </span>
              Share
            </button>
          </li>
          {tabsFor(MIXTAPE_RIGHT).map((tab) => (
            <TabItem key={tab.to} tab={tab} requests={requests} unread={unread} mixtape />
          ))}
        </ul>
      </nav>
      {/* Outside the landmark and its stacking context: a modal of its own. */}
      {sharing && <ShareSheet online={online} onClose={() => setSharing(false)} />}
    </>
  );
}

/**
 * The app's tab bar — docs/features/communities-create.md §6.3. Search is
 * docs/features/find-people.md §5.1; Friends, with its pending-request badge,
 * docs/features/friend-requests.md §5.1 — since notifications.md §5.3 it counts only
 * what waits for an answer; Home's badge counts unread notifications (§5.2). My List
 * is docs/features/bookmarks-my-list.md §5.2. Under Mixtape, the bar with Share
 * (ui-redesign.md §3.4).
 * Padded for the iPhone home indicator when the PWA runs full-screen.
 */
export function BottomNav() {
  const requests = useFriendRequests((state) => state.count);
  const unread = useNotifications((state) => state.unread);
  const mixtape = useMixtape();

  if (mixtape) {
    return <MixtapeNav requests={requests} unread={unread} />;
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <TabItem key={tab.to} tab={tab} requests={requests} unread={unread} mixtape={false} />
        ))}
      </ul>
    </nav>
  );
}
