import { create } from 'zustand';

import { fetchPublicSettings } from '../api/settings';
import {
  DEFAULT_ACCENT,
  DEFAULT_TAGLINE,
  isAccentColor,
  type AccentColor,
} from '../lib/appSettings';

interface SettingsState {
  accentColor: AccentColor;
  welcomeTagline: string;
  /** The banner text, or null when there is none (or the visitor is signed out). */
  announcement: string | null;
  /** Re-fetches and applies; on any failure the current values simply stay. */
  load: () => Promise<void>;
}

/**
 * Whether this page load's open has been sent. Only the first fetch carries
 * it, so re-fetches (a session change, an admin's save) are never counted
 * twice (docs/features/admin-overview.md §4.5).
 */
let openSent = false;

/** Tests only: start the next load as if the app had just opened. */
export function resetOpenSent(): void {
  openSent = false;
}

/**
 * The presentation settings the app applies — docs/features/admin-panel.md
 * §5.4. Defaults until the server answers; nothing ever waits on it.
 */
export const useSettingsStore = create<SettingsState>()((set) => ({
  accentColor: DEFAULT_ACCENT,
  welcomeTagline: DEFAULT_TAGLINE,
  announcement: null,
  load: async () => {
    try {
      const countOpen = !openSent;
      // Claimed before the request, so a second load starting meanwhile (the
      // session settling) does not count the same open again.
      openSent = true;
      let settings;
      try {
        settings = await fetchPublicSettings({ countOpen });
      } catch (error) {
        // A failed counting fetch leaves the open for the next one to count.
        if (countOpen) openSent = false;
        throw error;
      }
      set({
        // An unknown name (a newer server) falls back rather than breaking the theme.
        accentColor: isAccentColor(settings.accentColor) ? settings.accentColor : DEFAULT_ACCENT,
        welcomeTagline: settings.welcomeTagline,
        announcement: settings.announcement?.text ?? null,
      });
    } catch {
      // Defaults (or the last good values) stay; settings are never worth an error.
    }
  },
}));
