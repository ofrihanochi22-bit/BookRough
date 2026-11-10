import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LineIcon } from './LineIcon';
import { Wordmark } from './Wordmark';

interface TopBarProps {
  /** A back link before the logo, e.g. "← Communities" (ui-redesign.md §3.8). */
  back?: { to: string; label: string };
  /** Icon buttons on the right, e.g. Search and the bell on Home (§5.1). */
  children?: ReactNode;
}

/**
 * The Mixtape top row: the compact logo in the top-left corner, to the right
 * of the back link when the screen has one (ui-redesign.md §3.8). The logo is
 * not a link and adds no behaviour; the screen keeps its own h1.
 */
export function TopBar({ back, children }: TopBarProps) {
  return (
    <div className="mb-4 flex min-h-11 items-center gap-3">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 flex min-h-11 min-w-0 items-center gap-1 px-2 text-sm font-medium text-muted"
        >
          <LineIcon className="size-4">
            <path d="M15 5l-7 7 7 7" />
          </LineIcon>
          <span className="truncate">{back.label}</span>
        </Link>
      )}
      <div className="shrink-0">
        <Wordmark variant="compact" />
      </div>
      {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/** A round icon button in a header row, at least 44×44px. */
export const HEADER_ICON =
  'relative flex size-11 items-center justify-center rounded-full bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** The header's way into Global Search, now that Search left the tab bar (§3.4). */
export function SearchIconLink() {
  return (
    <Link to="/search" aria-label="Search" className={HEADER_ICON}>
      <LineIcon>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </LineIcon>
    </Link>
  );
}
