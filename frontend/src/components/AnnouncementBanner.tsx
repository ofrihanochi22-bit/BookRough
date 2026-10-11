import { useState } from 'react';

import { readDeviceValue, writeDeviceValue } from '../lib/deviceStorage';
import { useSettingsStore } from '../stores/settings';
import { DismissibleBar } from './ui/DismissibleBar';

const DISMISSED_KEY = 'bookrough.dismissedAnnouncement';

/**
 * The admin's announcement, at the top of every tabbed screen for signed-in
 * users — docs/features/admin-panel.md §5.4. Plain text. A dismissal is
 * remembered on this device for this exact text, so a new announcement shows.
 */
export function AnnouncementBanner() {
  const text = useSettingsStore((state) => state.announcement);
  const [dismissed, setDismissed] = useState(() => readDeviceValue(DISMISSED_KEY));

  if (!text || dismissed === text) {
    return null;
  }

  return (
    <DismissibleBar
      role="status"
      dismissLabel="Dismiss announcement"
      onDismiss={() => {
        writeDeviceValue(DISMISSED_KEY, text);
        setDismissed(text);
      }}
    >
      {text}
    </DismissibleBar>
  );
}
