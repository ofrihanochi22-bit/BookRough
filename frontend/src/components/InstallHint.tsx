import { useState } from 'react';

import { shouldOfferInstall } from '../lib/installHint';

const DISMISSED_KEY = 'bookrough.installHintDismissed';

/** Storage can be missing or throw (private mode, blocked site data); the hint then just shows. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Dismissed for this visit only.
  }
}

function offerInstall(): boolean {
  return shouldOfferInstall(navigator, (query) => window.matchMedia(query));
}

/**
 * "Add to Home Screen" instructions for iPhone and iPad visitors, on the
 * screens a friend lands on in Safari — docs/features/pwa-installable.md §5.1.
 * Never shown inside the installed app; a dismissal is remembered on this device.
 */
export function InstallHint() {
  const [visible, setVisible] = useState(() => offerInstall() && !readDismissed());

  if (!visible) {
    return null;
  }

  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-2 rounded-xl bg-accent-soft py-2 pr-1 pl-4 text-sm text-accent-ink"
    >
      <p className="min-w-0 flex-1 self-center text-left">
        Install BookRough: open <strong>Share</strong> (under ••• in newer Safari), then{' '}
        <strong>Add to Home Screen</strong>.
      </p>
      <button
        type="button"
        aria-label="Dismiss install hint"
        onClick={() => {
          rememberDismissed();
          setVisible(false);
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg leading-none"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
