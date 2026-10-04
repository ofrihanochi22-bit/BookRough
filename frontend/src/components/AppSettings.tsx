import { useEffect } from 'react';

import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';

/**
 * Fetches the presentation settings and applies the accent colour —
 * docs/features/admin-panel.md §5.4. Runs again when the session changes,
 * because the announcement is only for signed-in users. Renders nothing and
 * never blocks: until the answer arrives, the defaults are in place.
 */
export function AppSettings() {
  const status = useAuthStore((state) => state.status);
  const accentColor = useSettingsStore((state) => state.accentColor);

  useEffect(() => {
    void useSettingsStore.getState().load();
  }, [status]);

  useEffect(() => {
    document.documentElement.dataset.accent = accentColor;
  }, [accentColor]);

  return null;
}
