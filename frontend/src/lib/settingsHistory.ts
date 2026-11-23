import type { SettingChange } from '../api/settings';
import { accentLabel } from './appSettings';
import { isolate } from './bidi';

/** One line per change, e.g. "Ofri changed the accent colour from Purple to Green". */
export function describeChange(change: SettingChange): string {
  const name = change.changedBy?.displayName;
  const who = name ? isolate(name) : 'Deleted account';
  switch (change.key) {
    case 'accentColor':
      return `${who} changed the accent colour from ${accentLabel(change.oldValue)} to ${accentLabel(change.newValue)}`;
    case 'welcomeTagline':
      return `${who} changed the tagline to “${isolate(String(change.newValue))}”`;
    case 'announcement': {
      const before = change.oldValue as { enabled: boolean };
      const after = change.newValue as { enabled: boolean; text: string };
      if (after.enabled && !before.enabled) {
        return `${who} turned on the banner: “${isolate(after.text)}”`;
      }
      if (!after.enabled && before.enabled) {
        return `${who} turned off the banner`;
      }
      return `${who} changed the banner text to “${isolate(after.text)}”`;
    }
  }
}
