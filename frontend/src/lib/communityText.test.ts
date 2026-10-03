import { describe, expect, it } from 'vitest';

import {
  COMMUNITY_TEXT_MESSAGES,
  checkCommunityDescription,
  checkCommunityName,
  cleanCommunityDescription,
  cleanCommunityName,
} from './communityText';

// The same example table lives in backend/src/services/communityText.test.ts, so the
// two mirrors are held to identical behaviour.
const VALID_NAMES = [
  'FJ',
  'Friday Jazz',
  'Rock & Roll!',
  'Jazz (Fridays)',
  '"Quotes" club',
  'Who? What, when: now',
  'ג׳אז של שישי',
  '👩🏽‍💻 dev club',
  'x'.repeat(40),
];
const SHORT_OR_LONG_NAMES = ['a', '🎧', 'x'.repeat(41)];
const BAD_CHARACTER_NAMES = ['a<b', 'a@b', 'tag#1', 'zero​width', 'rtl‏mark', 'ctl\u0007x', 'ㅤㅤ'];

describe('cleanCommunityName', () => {
  it('trims, collapses whitespace and plain-ifies smart punctuation', () => {
    // Act & Assert
    expect(cleanCommunityName('  Friday \t Jazz ’n’ Soul ')).toBe("Friday Jazz 'n' Soul");
  });
});

describe('checkCommunityName', () => {
  it.each(VALID_NAMES)('accepts %j', (name) => {
    // Act & Assert
    expect(checkCommunityName(name).ok).toBe(true);
  });

  it('returns the cleaned name', () => {
    // Act & Assert
    expect(checkCommunityName('  Friday   Jazz ')).toEqual({ ok: true, value: 'Friday Jazz' });
  });

  it.each(['', '   ', '\n\t'])('rejects %j as missing', (name) => {
    // Act & Assert
    expect(checkCommunityName(name)).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.nameRequired,
    });
  });

  it.each(SHORT_OR_LONG_NAMES)('rejects %j for its length', (name) => {
    // Act & Assert
    expect(checkCommunityName(name)).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.nameLength,
    });
  });

  it.each(BAD_CHARACTER_NAMES)('rejects %j for its characters', (name) => {
    // Act & Assert
    expect(checkCommunityName(name)).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.character,
    });
  });

  it('rejects 40 graphemes that exceed 100 code points', () => {
    // Arrange — each family emoji is one grapheme but seven code points.
    const name = '👨‍👩‍👧‍👦'.repeat(15);

    // Act & Assert
    expect(checkCommunityName(name)).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.nameTooLong,
    });
  });
});

describe('cleanCommunityDescription', () => {
  it('keeps line breaks, drops trailing spaces, normalises CRLF and tabs', () => {
    // Act & Assert
    expect(cleanCommunityDescription('  Line one  \r\nLine\ttwo\t\n')).toBe('Line one\nLine two');
  });

  it('collapses more than three line breaks to three', () => {
    // Act & Assert
    expect(cleanCommunityDescription('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
    expect(cleanCommunityDescription('a\n\n\nb')).toBe('a\n\n\nb');
  });
});

describe('checkCommunityDescription', () => {
  it.each([undefined, null, '', '   \n\n  '])('stores %j as null', (raw) => {
    // Act & Assert
    expect(checkCommunityDescription(raw)).toEqual({ ok: true, value: null });
  });

  it('accepts punctuation, URLs, emoji and Hebrew', () => {
    // Arrange
    const text = 'Rules: be nice! <3 https://example.com/x?y=1 🎷 ג׳אז';

    // Act & Assert
    expect(checkCommunityDescription(text)).toEqual({ ok: true, value: text });
  });

  it('accepts exactly 280 characters and rejects 281', () => {
    // Act & Assert
    expect(checkCommunityDescription('x'.repeat(280)).ok).toBe(true);
    expect(checkCommunityDescription('x'.repeat(281))).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.descriptionLength,
    });
  });

  it('rejects 280 graphemes that exceed 1000 code points', () => {
    // Arrange
    const text = '👨‍👩‍👧‍👦'.repeat(150);

    // Act & Assert
    expect(checkCommunityDescription(text)).toEqual({
      ok: false,
      message: COMMUNITY_TEXT_MESSAGES.descriptionLength,
    });
  });

  it.each(['bell\u0007', 'zero​width', 'rtl‏mark', 'line sep'])(
    'rejects %j for an invisible character',
    (text) => {
      // Act & Assert
      expect(checkCommunityDescription(text)).toEqual({
        ok: false,
        message: COMMUNITY_TEXT_MESSAGES.descriptionCharacter,
      });
    },
  );
});
