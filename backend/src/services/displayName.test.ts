import { describe, expect, it } from 'vitest';

import {
  DISPLAY_NAME_MESSAGES,
  checkDisplayName,
  cleanDisplayName,
  displayNameKey,
  graphemeCount,
  isReservedKey,
} from './displayName.js';

// The same example table lives in frontend/src/lib/displayName.test.ts, so the
// two mirrors are held to identical behaviour.
const VALID = [
  'ג׳ני',
  'טל',
  'DJ 🎧',
  'Ofri H.',
  "o'neil",
  'Al-i',
  'José 2',
  '👩🏽‍💻 dev',
  'x'.repeat(20),
];
const INVALID_LENGTH = ['a', ' ', 'x'.repeat(21), '🎧'];
const INVALID_CHARACTER = [
  'a<b',
  'a@b',
  'tag#1',
  'a/b',
  'zero​width',
  'rtl‏mark',
  'ctl\u0007x',
  'ㅤㅤ',
];

function keyOf(raw: string): string {
  const check = checkDisplayName(raw);
  if (!check.ok) {
    throw new Error(`expected a valid name: ${raw}`);
  }
  return check.key;
}

describe('cleanDisplayName', () => {
  it('trims and collapses whitespace', () => {
    // Act & Assert
    expect(cleanDisplayName('  Ofri \t  H.  ')).toBe('Ofri H.');
  });

  it("turns iOS smart apostrophes and Unicode hyphens into ' and -", () => {
    // Act & Assert
    expect(cleanDisplayName('O’Neil‐Smith')).toBe("O'Neil-Smith");
  });
});

describe('graphemeCount', () => {
  it('counts what the eye sees: emoji and niqqud-bearing letters are one each', () => {
    // Act & Assert
    expect(graphemeCount('טל')).toBe(2);
    expect(graphemeCount('DJ 🎧')).toBe(4);
    expect(graphemeCount('👩🏽‍💻')).toBe(1);
    expect(graphemeCount('עֹ')).toBe(1);
  });
});

describe('checkDisplayName', () => {
  it.each(VALID)('accepts %j', (name) => {
    // Act & Assert
    expect(checkDisplayName(name).ok).toBe(true);
  });

  it.each(INVALID_LENGTH)('rejects %j for its length', (name) => {
    // Act & Assert
    expect(checkDisplayName(name)).toEqual({ ok: false, message: DISPLAY_NAME_MESSAGES.length });
  });

  it.each(INVALID_CHARACTER)('rejects %j for its characters', (name) => {
    // Act & Assert
    expect(checkDisplayName(name)).toEqual({ ok: false, message: DISPLAY_NAME_MESSAGES.character });
  });

  it('rejects 20 graphemes that exceed 50 code points', () => {
    // Arrange — each family emoji is one grapheme but seven code points.
    const name = '👨‍👩‍👧‍👦'.repeat(8);

    // Act & Assert
    expect(graphemeCount(name)).toBe(8);
    expect(checkDisplayName(name)).toEqual({ ok: false, message: DISPLAY_NAME_MESSAGES.tooLong });
  });

  it('returns the cleaned name with its key', () => {
    // Act & Assert
    expect(checkDisplayName('  Ofri   H. ')).toEqual({
      ok: true,
      displayName: 'Ofri H.',
      key: 'ofri h.',
    });
  });
});

describe('displayNameKey equivalences', () => {
  it.each([
    ['Ofri', 'ofri'],
    ['Ofri  H', 'ofri h'],
    ['עוֹפְרִי', 'עופרי'],
    ['José', 'jose'],
    ['Ｏｆｒｉ', 'Ofri'],
    ['O’Neil', "o'neil"],
    ['ג׳ני', "ג'ני"],
  ])('%j and %j share a key', (a, b) => {
    // Act & Assert
    expect(keyOf(a)).toBe(keyOf(b));
  });

  it('keeps punctuation-distinct names apart ("Al-i" vs "Ali")', () => {
    // Act & Assert
    expect(keyOf('Al-i')).not.toBe(keyOf('Ali'));
  });

  it('is what displayNameKey returns for a cleaned name', () => {
    // Act & Assert
    expect(displayNameKey('ÖFRI')).toBe('ofri');
  });
});

describe('isReservedKey', () => {
  it.each(['ADMIN', 'Admín', 'admin ', 'מנהל', 'Apple Music', 'deleted USER', 'BookRough'])(
    'reserves %j',
    (name) => {
      // Act & Assert
      expect(isReservedKey(keyOf(name))).toBe(true);
    },
  );

  it.each(['BookRough Team', 'the book rough fan', 'בוקראף שלי'])(
    'reserves %j because it contains the app name',
    (name) => {
      // Act & Assert
      expect(isReservedKey(keyOf(name))).toBe(true);
    },
  );

  it.each(['Badminton Ofri', 'Adminah', 'Ofri'])('allows %j', (name) => {
    // Act & Assert
    expect(isReservedKey(keyOf(name))).toBe(false);
  });
});
