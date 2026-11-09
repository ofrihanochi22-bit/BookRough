/**
 * Post comment rules — docs/features/posts-feed.md §4. A deliberate mirror of
 * backend/src/services/postText.ts; the server stays authoritative.
 */

import { cleanCommunityDescription, type TextCheck } from './communityText';
import { codePointCount, graphemeCount, hasOnlyPrintableCharacters } from './textRules';

/** The designed wait while the server converts a link (CLAUDE.md §7). */
export const CONVERTING_COPY = 'Finding this track on other services…';
/** The wait while the server reads a Bandcamp or SoundCloud link's details (link-only-posts.md §5.1). */
export const FETCHING_COPY = 'Getting the details…';

export const COMMENT_MAX_GRAPHEMES = 280;
const COMMENT_MAX_CODE_POINTS = 1000;

export const POST_TEXT_MESSAGES = {
  commentLength: `Comments can be up to ${COMMENT_MAX_GRAPHEMES} characters.`,
  commentCharacter: "The comment has a character that isn't allowed.",
} as const;

export function cleanPostComment(raw: string): string {
  return cleanCommunityDescription(raw);
}

/** A blank comment is sent as null. */
export function checkPostComment(raw: string): TextCheck<string | null> {
  const comment = cleanPostComment(raw);
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

/** A discussion comment — mirrors checkDiscussionBody (discussion-threads.md §4). */
export const DISCUSSION_MAX_GRAPHEMES = 500;
const DISCUSSION_MAX_CODE_POINTS = 2000;

export const DISCUSSION_MESSAGES = {
  length: `Comments can be up to ${DISCUSSION_MAX_GRAPHEMES} characters.`,
  character: POST_TEXT_MESSAGES.commentCharacter,
} as const;

/** null when the cleaned body can be sent; empty is not an error, just unsendable. */
export function discussionBodyProblem(cleaned: string): string | null {
  if (
    graphemeCount(cleaned) > DISCUSSION_MAX_GRAPHEMES ||
    codePointCount(cleaned) > DISCUSSION_MAX_CODE_POINTS
  ) {
    return DISCUSSION_MESSAGES.length;
  }
  if (cleaned.length > 0 && !hasOnlyPrintableCharacters(cleaned)) {
    return DISCUSSION_MESSAGES.character;
  }
  return null;
}
