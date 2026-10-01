/**
 * Display-name rules — docs/features/onboarding.md §4.
 *
 * The frontend mirrors these in frontend/src/lib/displayName.ts for instant
 * feedback. The packages share no code, so a change here must be made there
 * too; both test files use the same example table.
 */

export const MIN_GRAPHEMES = 2;
export const MAX_GRAPHEMES = 20;
/** Keeps the VarChar(50) columns safe; only long emoji sequences reach it. */
const MAX_CODE_POINTS = 50;

export const DISPLAY_NAME_MESSAGES = {
  length: `Use ${MIN_GRAPHEMES}–${MAX_GRAPHEMES} characters.`,
  tooLong: 'That name is too long.',
  character: "That character isn't allowed.",
  reserved: 'That name is reserved.',
  taken: 'That display name is already taken.',
} as const;

/**
 * Letters and marks in any script, digits, space, `. - _ '`, and what emoji
 * are made of: pictographs, ZWJ, variation selectors, skin tones, keycaps,
 * regional indicators and tag characters (subdivision flags). Everything else
 * — symbols, zero-width spaces, bidi marks, control characters — is rejected.
 *
 * Checked one code point at a time: a single character class mixing ZWJ and
 * modifiers is ambiguous to read (and to the linter).
 */
const BASE = /[\p{L}\p{M}\p{N} .\-_'\p{Extended_Pictographic}]/u;

/**
 * Hangul fillers are classified as letters but render as blank space, so a
 * name made of them would look empty.
 */
const BLANK_LETTERS = new Set([0x115f, 0x1160, 0x3164, 0xffa0]);

function isEmojiPart(codePoint: number): boolean {
  return (
    codePoint === 0x200d || // zero-width joiner
    codePoint === 0x20e3 || // combining keycap
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) || // skin tones
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) || // regional indicators
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) // tag characters
  );
}

function allowedCharacters(value: string): boolean {
  return Array.from(value).every((char) => {
    const codePoint = char.codePointAt(0)!;
    return !BLANK_LETTERS.has(codePoint) && (BASE.test(char) || isEmojiPart(codePoint));
  });
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export type DisplayNameCheck =
  { ok: true; displayName: string; key: string } | { ok: false; message: string };

/** NFC, trimmed, whitespace runs collapsed to one space. */
/**
 * Typographic apostrophes and hyphens become their plain forms first: iOS
 * "smart punctuation" turns ' into ’ as the user types.
 */
const TYPOGRAPHIC = /[‘’ʼ]/gu;
const HYPHENS = /[‐‑]/gu;

export function cleanDisplayName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(TYPOGRAPHIC, "'")
    .replace(HYPHENS, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Visible characters, as the eye counts them. */
export function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

/**
 * The uniqueness key: two names that differ only by case, spacing, accents or
 * niqqud, or Unicode compatibility forms (full-width letters) share one key.
 */
export function displayNameKey(displayName: string): string {
  return displayName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/‍/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
    .normalize('NFC');
}

const RESERVED_NAMES = [
  // The app and its staff.
  'BookRough',
  'Book Rough',
  'Admin',
  'Administrator',
  'Root',
  'Superuser',
  'Sysadmin',
  'Owner',
  'Staff',
  'Team',
  'Support',
  'Help',
  'Helpdesk',
  'System',
  'Moderator',
  'Mod',
  'Official',
  'Verified',
  'Security',
  'Privacy',
  'Legal',
  'Abuse',
  'Noreply',
  'Info',
  'Contact',
  'API',
  // The same, in Hebrew.
  'מנהל',
  'מנהלת',
  'הנהלה',
  'אדמין',
  'תמיכה',
  'מערכת',
  'צוות',
  'רשמי',
  'מאומת',
  'בוקראף',
  // External services the app talks about.
  'Spotify',
  'Apple Music',
  'YouTube',
  'Tidal',
  'Deezer',
  'Google',
  'Squigly',
  // Names that confuse readers or break UI copy.
  'Bot',
  'Robot',
  'Deleted user',
  'Unknown',
  'Anonymous',
  'Guest',
  'User',
  'Everyone',
  'Here',
  'Me',
  'You',
  'Test',
  'Null',
  'Undefined',
  'משתמש מחוק',
  'אנונימי',
  'אורח',
  'בוט',
];

const RESERVED_KEYS = new Set(RESERVED_NAMES.map(displayNameKey));
/** Blocked anywhere inside a name, not only as the whole name. */
const RESERVED_FRAGMENTS = ['bookrough', 'בוקראף'];

export function isReservedKey(key: string): boolean {
  const compact = key.replace(/ /g, '');
  return RESERVED_KEYS.has(key) || RESERVED_FRAGMENTS.some((part) => compact.includes(part));
}

/** Rules 1–3 of the spec: clean, length, characters. Reserved is checked separately. */
export function checkDisplayName(raw: string): DisplayNameCheck {
  const displayName = cleanDisplayName(raw);
  const length = graphemeCount(displayName);

  if (length < MIN_GRAPHEMES || length > MAX_GRAPHEMES) {
    return { ok: false, message: DISPLAY_NAME_MESSAGES.length };
  }
  if (!allowedCharacters(displayName)) {
    return { ok: false, message: DISPLAY_NAME_MESSAGES.character };
  }

  const key = displayNameKey(displayName);
  if (
    Array.from(displayName).length > MAX_CODE_POINTS ||
    Array.from(key).length > MAX_CODE_POINTS
  ) {
    return { ok: false, message: DISPLAY_NAME_MESSAGES.tooLong };
  }
  if (key.length === 0) {
    return { ok: false, message: DISPLAY_NAME_MESSAGES.character };
  }

  return { ok: true, displayName, key };
}
