/**
 * Display-name rules 1–3 (clean, length, characters) — docs/features/onboarding.md §4.
 *
 * A deliberate mirror of backend/src/services/displayName.ts, for instant
 * feedback while typing; the server stays authoritative and also checks
 * uniqueness and reserved names. Change both together. The cleaning and
 * character rules shared with community names live in ./textRules.ts.
 */

import { cleanLine, codePointCount, graphemeCount, hasOnlyNameCharacters } from './textRules';

export { graphemeCount };

export const MIN_GRAPHEMES = 2;
export const MAX_GRAPHEMES = 20;
const MAX_CODE_POINTS = 50;

export const DISPLAY_NAME_MESSAGES = {
  length: `Use ${MIN_GRAPHEMES}–${MAX_GRAPHEMES} characters.`,
  tooLong: 'That name is too long.',
  character: "That character isn't allowed.",
  reserved: 'That name is reserved.',
  taken: 'That display name is already taken.',
} as const;

/** NFC, plain punctuation, trimmed, whitespace runs collapsed to one space. */
export function cleanDisplayName(raw: string): string {
  return cleanLine(raw);
}

/** Null when the name passes rules 1–3, otherwise the message to show. */
export function displayNameProblem(raw: string): string | null {
  const name = cleanDisplayName(raw);
  const length = graphemeCount(name);

  if (length < MIN_GRAPHEMES || length > MAX_GRAPHEMES) {
    return DISPLAY_NAME_MESSAGES.length;
  }
  if (!hasOnlyNameCharacters(name)) {
    return DISPLAY_NAME_MESSAGES.character;
  }
  if (codePointCount(name) > MAX_CODE_POINTS) {
    return DISPLAY_NAME_MESSAGES.tooLong;
  }
  return null;
}
