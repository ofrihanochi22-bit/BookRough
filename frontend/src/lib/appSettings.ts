import { cleanLine, graphemeCount, hasOnlyPrintableCharacters } from './textRules';

/**
 * Mirrors backend/src/services/appSettings.ts (docs/features/admin-panel.md
 * §3.2) for instant feedback. The packages share no code, so a change there
 * must be made here too. The server's answer is the one that counts.
 */

export const ACCENT_COLORS = [
  { value: 'purple', label: 'Purple' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'orange', label: 'Orange' },
  { value: 'pink', label: 'Pink' },
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number]['value'];

export const DEFAULT_ACCENT: AccentColor = 'purple';
export const BANNER_MAX_GRAPHEMES = 140;
export const TAGLINE_MAX_GRAPHEMES = 80;
export const DEFAULT_TAGLINE = 'Share music with friends, on whatever app they use.';

export const SETTINGS_MESSAGES = {
  bannerLength: `The banner text can be up to ${BANNER_MAX_GRAPHEMES} characters.`,
  bannerEmpty: 'Write the banner text before turning it on.',
  bannerCharacter: "The banner text has a character that isn't allowed.",
  taglineEmpty: 'The tagline cannot be empty.',
  taglineLength: `The tagline can be up to ${TAGLINE_MAX_GRAPHEMES} characters.`,
  taglineCharacter: "The tagline has a character that isn't allowed.",
} as const;

export function accentLabel(value: unknown): string {
  return ACCENT_COLORS.find((color) => color.value === value)?.label ?? String(value);
}

export function isAccentColor(value: unknown): value is AccentColor {
  return ACCENT_COLORS.some((color) => color.value === value);
}

/** The banner text's problem, or null. */
export function bannerProblem(enabled: boolean, raw: string): string | null {
  const text = cleanLine(raw);
  if (!hasOnlyPrintableCharacters(text)) {
    return SETTINGS_MESSAGES.bannerCharacter;
  }
  if (graphemeCount(text) > BANNER_MAX_GRAPHEMES) {
    return SETTINGS_MESSAGES.bannerLength;
  }
  if (enabled && text === '') {
    return SETTINGS_MESSAGES.bannerEmpty;
  }
  return null;
}

/** The tagline's problem, or null. */
export function taglineProblem(raw: string): string | null {
  const tagline = cleanLine(raw);
  if (tagline === '') {
    return SETTINGS_MESSAGES.taglineEmpty;
  }
  if (!hasOnlyPrintableCharacters(tagline)) {
    return SETTINGS_MESSAGES.taglineCharacter;
  }
  if (graphemeCount(tagline) > TAGLINE_MAX_GRAPHEMES) {
    return SETTINGS_MESSAGES.taglineLength;
  }
  return null;
}
