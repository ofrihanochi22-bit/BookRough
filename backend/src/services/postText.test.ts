import { describe, expect, it } from 'vitest';

import { checkPostComment, POST_TEXT_MESSAGES } from './postText.js';

describe('checkPostComment', () => {
  it.each([null, undefined, '', '   \n\t  '])('treats %j as no comment', (raw) => {
    // Act & Assert
    expect(checkPostComment(raw)).toEqual({ ok: true, value: null });
  });

  it('keeps line breaks, trims, and collapses long runs of blank lines', () => {
    // Act
    const result = checkPostComment('  Listen to this  \r\n\n\n\n\nאחלה שיר 🎶  ');

    // Assert
    expect(result).toEqual({ ok: true, value: 'Listen to this\n\n\nאחלה שיר 🎶' });
  });

  it('accepts exactly 280 characters, counting an emoji as one', () => {
    // Act & Assert
    expect(checkPostComment('👍🏽'.repeat(280)).ok).toBe(true);
  });

  it('rejects 281 characters', () => {
    // Act & Assert
    expect(checkPostComment('a'.repeat(281))).toEqual({
      ok: false,
      message: POST_TEXT_MESSAGES.commentLength,
    });
  });

  it('rejects zero-width and bidi characters', () => {
    // Act & Assert
    expect(checkPostComment('hi‮there')).toEqual({
      ok: false,
      message: POST_TEXT_MESSAGES.commentCharacter,
    });
  });

  it('rejects a short comment that is too many code points', () => {
    // Act: family emoji are one grapheme but several code points each.
    const result = checkPostComment('👨‍👩‍👧‍👦'.repeat(200));

    // Assert
    expect(result).toEqual({ ok: false, message: POST_TEXT_MESSAGES.commentLength });
  });
});
