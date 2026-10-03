import { describe, expect, it } from 'vitest';

import {
  DISPLAY_NAME_MESSAGES,
  cleanDisplayName,
  displayNameProblem,
  graphemeCount,
} from './displayName';

// The same example table as backend/src/services/displayName.test.ts: the two
// mirrors must agree on every case.
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

describe('displayNameProblem', () => {
  it.each(VALID)('accepts %j', (name) => {
    // Act & Assert
    expect(displayNameProblem(name)).toBeNull();
  });

  it.each(INVALID_LENGTH)('rejects %j for its length', (name) => {
    // Act & Assert
    expect(displayNameProblem(name)).toBe(DISPLAY_NAME_MESSAGES.length);
  });

  it.each(INVALID_CHARACTER)('rejects %j for its characters', (name) => {
    // Act & Assert
    expect(displayNameProblem(name)).toBe(DISPLAY_NAME_MESSAGES.character);
  });

  it('rejects 20 graphemes that exceed 50 code points', () => {
    // Act & Assert
    expect(displayNameProblem('👨‍👩‍👧‍👦'.repeat(8))).toBe(DISPLAY_NAME_MESSAGES.tooLong);
  });

  it("accepts the iPhone's smart apostrophe", () => {
    // Act & Assert
    expect(displayNameProblem('O’Neil')).toBeNull();
  });
});

describe('cleanDisplayName / graphemeCount', () => {
  it('cleans like the server', () => {
    // Act & Assert
    expect(cleanDisplayName('  O’Neil \t‐ x ')).toBe("O'Neil - x");
  });

  it('counts graphemes', () => {
    // Act & Assert
    expect(graphemeCount('DJ 🎧')).toBe(4);
  });
});
