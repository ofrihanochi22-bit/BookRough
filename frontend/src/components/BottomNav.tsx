import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

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
 * The app's tab bar — docs/features/communities-create.md §6.3. Search opens a
 * Coming soon screen until Phase 5; My List is docs/features/bookmarks-my-list.md §5.2. Padded for the iPhone
 * home indicator when the PWA runs full-screen.
 */
export function BottomNav() {
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
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {tab.icon}
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
