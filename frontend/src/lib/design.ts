import { readDeviceValue, writeDeviceValue } from './deviceStorage';

/**
 * The per-device design switch — docs/features/ui-redesign.md §4. Two looks
 * live side by side until the swap PR: `current` (today's, the default for
 * everyone) and `mixtape`. The choice is kept on this device only and never
 * sent to the server. Removed in the cleanup PR.
 */
export type Design = 'current' | 'mixtape';

export const DEFAULT_DESIGN: Design = 'current';
export const DESIGN_STORAGE_KEY = 'bookrough.design';

/** `?design=new` / `?design=old` on any URL; any other value is ignored. */
const URL_VALUES: Readonly<Record<string, Design>> = { new: 'mixtape', old: 'current' };

export function isDesign(value: unknown): value is Design {
  return value === 'current' || value === 'mixtape';
}

/** The design named in a URL's query string, or null when it names none we know. */
export function designFromSearch(search: string): Design | null {
  const value = new URLSearchParams(search).get('design');
  return value !== null && Object.hasOwn(URL_VALUES, value) ? URL_VALUES[value]! : null;
}

export function readStoredDesign(): Design {
  const stored = readDeviceValue(DESIGN_STORAGE_KEY);
  return isDesign(stored) ? stored : DEFAULT_DESIGN;
}

export function storeDesign(design: Design): void {
  writeDeviceValue(DESIGN_STORAGE_KEY, design);
}

/**
 * The design this visit starts with: a known `?design=` value wins and is
 * remembered; otherwise the stored choice; otherwise the default. Storage that
 * throws (private mode) only means the choice lasts for this visit.
 */
export function initialDesign(search: string): Design {
  const fromUrl = designFromSearch(search);
  if (fromUrl) {
    storeDesign(fromUrl);
    return fromUrl;
  }
  return readStoredDesign();
}

/**
 * The browser bar colour (`theme-color`) per design and scheme. index.html
 * carries the Current values statically; under Mixtape they are replaced at
 * runtime, since the HTML cannot know the device's choice.
 */
export const THEME_COLORS: Readonly<Record<Design, { light: string; dark: string }>> = {
  current: { light: '#fbfaf7', dark: '#151413' },
  mixtape: { light: '#ECEAF4', dark: '#1B1A2E' },
};
