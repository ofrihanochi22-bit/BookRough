import { describe, expect, it } from 'vitest';

import {
  cleanLine,
  codePointCount,
  graphemeCount,
  hasOnlyNameCharacters,
  hasOnlyPrintableCharacters,
} from './textRules.js';

describe('cleanLine', () => {
  it('normalises to NFC, plain punctuation and single spaces', () => {
    // Arrange — "é" written as e + combining acute.
    const raw = '  José ‐ O’Neil  ';

    // Act & Assert
    expect(cleanLine(raw)).toBe("José - O'Neil");
  });
});

describe('counts', () => {
  it('counts graphemes as the eye does and code points as stored', () => {
    // Act & Assert
    expect(graphemeCount('👩🏽‍💻')).toBe(1);
    expect(codePointCount('👩🏽‍💻')).toBe(4);
  });
});

describe('hasOnlyNameCharacters', () => {
  it('allows the base set and only the extra punctuation it is given', () => {
    // Act & Assert
    expect(hasOnlyNameCharacters("Ofri O'Neil-2 🎧")).toBe(true);
    expect(hasOnlyNameCharacters('Rock & Roll')).toBe(false);
    expect(hasOnlyNameCharacters('Rock & Roll', '&')).toBe(true);
  });

  it('rejects Hangul fillers that render blank', () => {
    // Act & Assert
    expect(hasOnlyNameCharacters('ㅤ', '&')).toBe(false);
  });
});

describe('hasOnlyPrintableCharacters', () => {
  it('allows line breaks, symbols and emoji built with ZWJ and tag characters', () => {
    // Arrange — the Scotland flag is a tag sequence.
    const text = 'a <b> #c\n👩🏽‍💻 🏴󠁧󠁢󠁳󠁣󠁴󠁿';

    // Act & Assert
    expect(hasOnlyPrintableCharacters(text)).toBe(true);
  });

  it.each(['\u0007', '​', '‏', '﻿', ' ', 'ㅤ'])('rejects %j', (char) => {
    // Act & Assert
    expect(hasOnlyPrintableCharacters(`a${char}b`)).toBe(false);
  });
});
