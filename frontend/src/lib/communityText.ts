/**
 * Community name and description rules — docs/features/communities-create.md §4.
 *
 * A deliberate mirror of backend/src/services/communityText.ts, for instant
 * feedback while typing; the server stays authoritative. Change both together;
 * both test files use the same example table.
 */

import {
  cleanLine,
  codePointCount,
  graphemeCount,
  hasOnlyNameCharacters,
  hasOnlyPrintableCharacters,
} from './textRules';

export const NAME_MIN_GRAPHEMES = 2;
export const NAME_MAX_GRAPHEMES = 40;
/** Keeps the VarChar(100) column safe; only long emoji sequences reach it. */
const NAME_MAX_CODE_POINTS = 100;
export const DESCRIPTION_MAX_GRAPHEMES = 280;
const DESCRIPTION_MAX_CODE_POINTS = 1000;

/** Punctuation a community name allows on top of what a display name allows. */
const NAME_EXTRA_PUNCTUATION = '&!?,:()"';

export const COMMUNITY_TEXT_MESSAGES = {
  nameRequired: 'A Community name is required.',
  nameLength: `Use ${NAME_MIN_GRAPHEMES}–${NAME_MAX_GRAPHEMES} characters.`,
  nameTooLong: 'That name is too long.',
  character: "That character isn't allowed.",
  descriptionCharacter: "The description has a character that isn't allowed.",
  descriptionLength: `Keep the description to ${DESCRIPTION_MAX_GRAPHEMES} characters.`,
} as const;

export type TextCheck<T> = { ok: true; value: T } | { ok: false; message: string };

export function cleanCommunityName(raw: string): string {
  return cleanLine(raw);
}

export function checkCommunityName(raw: string): TextCheck<string> {
  const name = cleanCommunityName(raw);
  const length = graphemeCount(name);

  if (length === 0) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.nameRequired };
  }
  if (length < NAME_MIN_GRAPHEMES || length > NAME_MAX_GRAPHEMES) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.nameLength };
  }
  if (!hasOnlyNameCharacters(name, NAME_EXTRA_PUNCTUATION)) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.character };
  }
  if (codePointCount(name) > NAME_MAX_CODE_POINTS) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.nameTooLong };
  }
  return { ok: true, value: name };
}

/**
 * NFC; line endings and tabs normalised; each line's trailing spaces dropped;
 * more than three line breaks in a row collapsed to three; trimmed.
 */
export function cleanCommunityDescription(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/** A missing or blank description is stored as null. */
export function checkCommunityDescription(
  raw: string | null | undefined,
): TextCheck<string | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  const description = cleanCommunityDescription(raw);
  if (description.length === 0) {
    return { ok: true, value: null };
  }
  if (
    graphemeCount(description) > DESCRIPTION_MAX_GRAPHEMES ||
    codePointCount(description) > DESCRIPTION_MAX_CODE_POINTS
  ) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.descriptionLength };
  }
  if (!hasOnlyPrintableCharacters(description)) {
    return { ok: false, message: COMMUNITY_TEXT_MESSAGES.descriptionCharacter };
  }
  return { ok: true, value: description };
}
