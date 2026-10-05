import { createLogger } from '../utils/logger.js';

const log = createLogger('ratingNotification');

export interface RatingNotification {
  authorId: string;
  raterId: string;
  postId: string;
  score: number;
}

/**
 * Tells a post's author it was rated (UC-13; former Step 4.3,
 * docs/features/rate-post.md §4.2).
 *
 * A stub: it only logs. This is the single place a real channel (an in-app
 * inbox, push) plugs in — there is no email to send to (CLAUDE.md §5). Only
 * ids and the score are logged, never the comment or anyone's name.
 */
export function notifyAuthorOfRating(notification: RatingNotification): void {
  log.info(
    {
      authorId: notification.authorId,
      raterId: notification.raterId,
      postId: notification.postId,
      score: notification.score,
    },
    'Rating notification (stub)',
  );
}
