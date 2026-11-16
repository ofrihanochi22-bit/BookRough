import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { badgeText } from '../lib/friendCopy';
import { useFriendRequests } from '../stores/friendRequests';
import { useNotifications } from '../stores/notifications';
import { ShareSheet } from './ShareSheet';
import { FRIENDS_GLYPH, HOME_GLYPH, PROFILE_GLYPH, SHARE_GLYPH } from './ui/appIcons';
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
    icon: <Icon>{HOME_GLYPH}</Icon>,
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: <Icon>{FRIENDS_GLYPH}</Icon>,
  },
  {
    to: '/my-list',
    label: 'My List',
    icon: <BookmarkIcon />,
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: <Icon>{PROFILE_GLYPH}</Icon>,
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

/** The tabs either side of Share. */
const LEFT_TABS = ['/home', '/friends'];
const RIGHT_TABS = ['/my-list', '/profile'];

function tabsFor(paths: readonly string[]): Tab[] {
  return paths.map((path) => TABS.find((tab) => tab.to === path)!);
}

function TabItem({ tab, requests, unread }: { tab: Tab; requests: number; unread: number }) {
  const badge = badgeFor(tab.to, requests, unread);
  return (
    <li className="flex-1">
      <NavLink
        to={tab.to}
        aria-label={badge ? `${tab.label}, ${badge.label}` : undefined}
        className={({ isActive }) =>
          `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
            isActive ? 'text-accent' : 'text-muted'
          } font-medium`
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
 * The app's tab bar — docs/features/ui-redesign.md §3.4: Home · Friends ·
 * Share · My List · Profile. Share is a raised accent button in the centre that
 * opens the Share sheet (§5.0b). Friends, with its pending-request badge, is
 * docs/features/friend-requests.md §5.1 — since notifications.md §5.3 it counts
 * only what waits for an answer; Home's badge counts unread notifications
 * (§5.2). My List is docs/features/bookmarks-my-list.md §5.2. Search lives in
 * the Home and Friends headers. Padded for the iPhone home indicator when the
 * PWA runs full-screen.
 */
export function BottomNav() {
  const requests = useFriendRequests((state) => state.count);
  const unread = useNotifications((state) => state.unread);
  const [sharing, setSharing] = useState(false);
  const online = useOnlineStatus();

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--line)]"
      >
        <ul className="mx-auto flex max-w-md items-end">
          {tabsFor(LEFT_TABS).map((tab) => (
            <TabItem key={tab.to} tab={tab} requests={requests} unread={unread} />
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
                <Icon>{SHARE_GLYPH}</Icon>
              </span>
              Share
            </button>
          </li>
          {tabsFor(RIGHT_TABS).map((tab) => (
            <TabItem key={tab.to} tab={tab} requests={requests} unread={unread} />
          ))}
        </ul>
      </nav>
      {/* Outside the landmark and its stacking context: a modal of its own. */}
      {sharing && <ShareSheet online={online} onClose={() => setSharing(false)} />}
    </>
  );
}
