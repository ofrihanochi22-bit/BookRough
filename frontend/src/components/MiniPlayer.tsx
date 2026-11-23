import { useEffect, useRef, useState } from 'react';

import { isPlayableEmbed, playerName } from '../lib/embeds';
import { usePlayer } from '../stores/player';

/** Placeholder sizes (docs/features/in-app-player.md §5.2). */
const FRAME_CLASS = {
  BANDCAMP: 'h-[120px]',
  SOUNDCLOUD: 'h-[120px]',
  YOUTUBE: 'aspect-video max-h-[200px]',
} as const;

/**
 * The one docked player (in-app-player.md §5.2). Rendered once in `App`, beside
 * the routes, so navigating never remounts its iframe: the song keeps playing
 * while the user scrolls and changes screens.
 */
export function MiniPlayer() {
  const current = usePlayer((state) => state.current);
  const close = usePlayer((state) => state.close);
  const setHeight = usePlayer((state) => state.setHeight);
  const aboveTabBar = usePlayer((state) => state.aboveTabBar);
  const barRef = useRef<HTMLDivElement>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // The tab layout pads its content by this, so the bar hides nothing.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => setHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [current, setHeight]);

  if (!current || !isPlayableEmbed(current)) {
    return null;
  }
  const name = playerName(current.platform);

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Player"
      className={`fixed inset-x-0 z-10 mx-auto max-w-md bg-surface shadow-[0_-1px_0_var(--line)] ${
        // Clear of the tab bar (3.5rem) and its raised Share button (1.25rem more).
        aboveTabBar
          ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]'
          : 'bottom-0 pb-[env(safe-area-inset-bottom)]'
      }`}
    >
      <div className="flex items-center gap-2 pl-4">
        <p dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">
          {current.title}
        </p>
        <button
          type="button"
          aria-label="Close player"
          onClick={close}
          className="inline-flex size-11 shrink-0 items-center justify-center text-muted focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="relative">
        {loadedUrl !== current.url && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted">
            Loading player…
          </p>
        )}
        <iframe
          // A new post gets a new frame, never a reused one.
          key={current.url}
          src={current.url}
          title={`${name} player: ${current.title}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoadedUrl(current.url)}
          className={`relative block w-full border-0 ${FRAME_CLASS[current.platform]}`}
        />
      </div>
    </div>
  );
}
