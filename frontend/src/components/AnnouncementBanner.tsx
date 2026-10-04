import { useState } from 'react';

import { useSettingsStore } from '../stores/settings';

const DISMISSED_KEY = 'bookrough.dismissedAnnouncement';

/** Storage can be missing or throw (private mode, blocked site data); the banner then just shows. */
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(text: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, text);
  } catch {
    // Dismissed for this visit only.
  }
}

/**
 * The admin's announcement, at the top of every tabbed screen for signed-in
 * users — docs/features/admin-panel.md §5.4. Plain text. A dismissal is
 * remembered on this device for this exact text, so a new announcement shows.
 */
export function AnnouncementBanner() {
  const text = useSettingsStore((state) => state.announcement);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!text || dismissed === text) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2 bg-accent-soft py-2 pr-1 pl-4 text-sm text-accent-ink"
    >
      <p className="min-w-0 flex-1 self-center break-words">{text}</p>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => {
          rememberDismissed(text);
          setDismissed(text);
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
