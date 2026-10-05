import { describe, expect, it } from 'vitest';

import { checkPostComment, POST_TEXT_MESSAGES } from './postText';

/* Mirrors backend/src/services/postText.test.ts. */
describe('checkPostComment', () => {
  it('treats blank as no comment and keeps line breaks', () => {
    // Act & Assert
    expect(checkPostComment('   ')).toEqual({ ok: true, value: null });
    expect(checkPostComment(' a\r\nb ')).toEqual({ ok: true, value: 'a\nb' });
  });

  it('accepts 280 characters and rejects 281', () => {
    // Act & Assert
    expect(checkPostComment('👍🏽'.repeat(280)).ok).toBe(true);
    expect(checkPostComment('a'.repeat(281))).toEqual({
      ok: false,
      message: POST_TEXT_MESSAGES.commentLength,
    });
  });

  it('rejects invisible characters, and too many code points', () => {
    // Act & Assert
    expect(checkPostComment('hi‮there')).toEqual({
      ok: false,
      message: POST_TEXT_MESSAGES.commentCharacter,
    });
    expect(checkPostComment('👨‍👩‍👧‍👦'.repeat(200)).ok).toBe(false);
  });
});
