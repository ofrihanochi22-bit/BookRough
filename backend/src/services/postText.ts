/**
 * Post comment rules — docs/features/posts-feed.md §4. The same cleaning as a
 * community description: line breaks kept, blank means none.
 *
 * The frontend mirrors these in frontend/src/lib/postText.ts.
 */

import { cleanCommunityDescription, type TextCheck } from './communityText.js';
import { codePointCount, graphemeCount, hasOnlyPrintableCharacters } from './textRules.js';

export const COMMENT_MAX_GRAPHEMES = 280;
const COMMENT_MAX_CODE_POINTS = 1000;

export const POST_TEXT_MESSAGES = {
  commentLength: `Comments can be up to ${COMMENT_MAX_GRAPHEMES} characters.`,
  commentCharacter: "The comment has a character that isn't allowed.",
} as const;

/** A missing or blank comment is stored as null. */
export function checkPostComment(raw: string | null | undefined): TextCheck<string | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  const comment = cleanCommunityDescription(raw);
  if (comment.length === 0) {
    return { ok: true, value: null };
  }
  if (
    graphemeCount(comment) > COMMENT_MAX_GRAPHEMES ||
    codePointCount(comment) > COMMENT_MAX_CODE_POINTS
  ) {
    return { ok: false, message: POST_TEXT_MESSAGES.commentLength };
  }
  if (!hasOnlyPrintableCharacters(comment)) {
    return { ok: false, message: POST_TEXT_MESSAGES.commentCharacter };
  }
  return { ok: true, value: comment };
}
