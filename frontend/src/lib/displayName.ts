/**
 * Display-name rules 1–3 (clean, length, characters) — docs/features/onboarding.md §4.
 *
 * A deliberate mirror of backend/src/services/displayName.ts, for instant
 * feedback while typing; the server stays authoritative and also checks
 * uniqueness and reserved names. Change both together.
 */

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

const BASE = /[\p{L}\p{M}\p{N} .\-_'\p{Extended_Pictographic}]/u;

function isEmojiPart(codePoint: number): boolean {
  return (
    codePoint === 0x200d || // zero-width joiner
    codePoint === 0x20e3 || // combining keycap
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) || // skin tones
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) || // regional indicators
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) // tag characters
  );
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function cleanDisplayName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

/** Null when the name passes rules 1–3, otherwise the message to show. */
export function displayNameProblem(raw: string): string | null {
  const name = cleanDisplayName(raw);
  const length = graphemeCount(name);

  if (length < MIN_GRAPHEMES || length > MAX_GRAPHEMES) {
    return DISPLAY_NAME_MESSAGES.length;
  }
  if (!Array.from(name).every((char) => BASE.test(char) || isEmojiPart(char.codePointAt(0)!))) {
    return DISPLAY_NAME_MESSAGES.character;
  }
  if (Array.from(name).length > MAX_CODE_POINTS) {
    return DISPLAY_NAME_MESSAGES.tooLong;
  }
  return null;
}
