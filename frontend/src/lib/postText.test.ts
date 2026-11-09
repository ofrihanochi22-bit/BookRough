import { describe, expect, it } from 'vitest';

import {
  checkPostComment,
  DISCUSSION_MESSAGES,
  discussionBodyProblem,
  POST_TEXT_MESSAGES,
} from './postText';

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

describe('discussionBodyProblem (discussion-threads.md §4)', () => {
  it('accepts up to 500 characters, and an empty draft is no problem', () => {
    // Act + Assert
    expect(discussionBodyProblem('a'.repeat(500))).toBeNull();
    expect(discussionBodyProblem('')).toBeNull();
  });

  it('refuses over 500 characters, or over 2000 code points', () => {
    // Act + Assert
    expect(discussionBodyProblem('a'.repeat(501))).toBe(DISCUSSION_MESSAGES.length);
    expect(discussionBodyProblem('👨‍👩‍👧‍👦'.repeat(300))).toBe(DISCUSSION_MESSAGES.length);
  });

  it('refuses a control character', () => {
    // Act + Assert
    expect(discussionBodyProblem('hi')).toBe(DISCUSSION_MESSAGES.character);
  });
});
