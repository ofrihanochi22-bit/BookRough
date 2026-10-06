import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { badgeText } from '../lib/friendCopy';
import { useFriendRequests } from '../stores/friendRequests';
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

/**
 * The app's tab bar — docs/features/communities-create.md §6.3. Search is
 * docs/features/find-people.md §5.1; Friends, with its pending-request badge,
 * docs/features/friend-requests.md §5.1; My List is docs/features/bookmarks-my-list.md §5.2.
 * Padded for the iPhone home indicator when the PWA runs full-screen.
 */
export function BottomNav() {
  const requests = useFriendRequests((state) => state.count);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              aria-label={
                tab.to === '/friends' && requests > 0
                  ? `${tab.label}, ${requests} ${requests === 1 ? 'request' : 'requests'}`
                  : undefined
              }
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <span className="relative">
                {tab.icon}
                {tab.to === '/friends' && requests > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-on-accent"
                  >
                    {badgeText(requests)}
                  </span>
                )}
              </span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
