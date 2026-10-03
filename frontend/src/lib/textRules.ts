/**
 * Text rules shared by every user-typed name and description:
 * docs/features/onboarding.md §4 and docs/features/communities-create.md §4.
 *
 * A deliberate mirror of backend/src/services/textRules.ts — the packages share
 * no code. Change both together.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Visible characters, as the eye counts them. */
export function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

export function codePointCount(value: string): number {
  return Array.from(value).length;
}

/**
 * Typographic apostrophes and hyphens become their plain forms first: iOS
 * "smart punctuation" turns ' into ’ as the user types.
 */
const TYPOGRAPHIC = /[‘’ʼ]/gu;
const HYPHENS = /[‐‑]/gu;

/** One line of text: NFC, plain punctuation, whitespace runs collapsed, trimmed. */
export function cleanLine(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(TYPOGRAPHIC, "'")
    .replace(HYPHENS, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Letters and marks in any script, digits, space, `. - _ '`, and what emoji
 * are made of: pictographs, ZWJ, variation selectors, skin tones, keycaps,
 * regional indicators and tag characters (subdivision flags). Everything else
 * — symbols, zero-width spaces, bidi marks, control characters — is rejected.
 *
 * Checked one code point at a time: a single character class mixing ZWJ and
 * modifiers is ambiguous to read (and to the linter).
 */
const NAME_BASE = /[\p{L}\p{M}\p{N} .\-_'\p{Extended_Pictographic}]/u;

/**
 * Hangul fillers are classified as letters but render as blank space, so a
 * name made of them would look empty.
 */
const BLANK_LETTERS = new Set([0x115f, 0x1160, 0x3164, 0xffa0]);

const ZWJ = 0x200d;

function isTagCharacter(codePoint: number): boolean {
  return codePoint >= 0xe0020 && codePoint <= 0xe007f;
}

function isEmojiPart(codePoint: number): boolean {
  return (
    codePoint === ZWJ ||
    codePoint === 0x20e3 || // combining keycap
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) || // skin tones
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) || // regional indicators
    isTagCharacter(codePoint)
  );
}

/**
 * True when every character is allowed in a name. `extra` lists punctuation a
 * particular kind of name allows on top of the base set (community names allow
 * `& ! ? , : ( ) "`; display names allow nothing more).
 */
export function hasOnlyNameCharacters(value: string, extra = ''): boolean {
  return Array.from(value).every((char) => {
    const codePoint = char.codePointAt(0)!;
    return (
      !BLANK_LETTERS.has(codePoint) &&
      (NAME_BASE.test(char) || isEmojiPart(codePoint) || extra.includes(char))
    );
  });
}

/** Control, format, surrogate, private-use and separator characters other than spaces. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

/**
 * True when free text (a description) contains only printable characters and
 * line breaks. Zero-width characters, bidi marks and control characters are
 * rejected; ZWJ and tag characters survive because emoji are built from them.
 */
export function hasOnlyPrintableCharacters(value: string): boolean {
  return Array.from(value).every((char) => {
    const codePoint = char.codePointAt(0)!;
    if (char === '\n' || codePoint === ZWJ || isTagCharacter(codePoint)) {
      return true;
    }
    return !BLANK_LETTERS.has(codePoint) && !INVISIBLE.test(char);
  });
}
