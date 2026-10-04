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
 * The presentation settings the app applies — docs/features/admin-panel.md
 * §5.4. Defaults until the server answers; nothing ever waits on it.
 */
export const useSettingsStore = create<SettingsState>()((set) => ({
  accentColor: DEFAULT_ACCENT,
  welcomeTagline: DEFAULT_TAGLINE,
  announcement: null,
  load: async () => {
    try {
      const settings = await fetchPublicSettings();
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
