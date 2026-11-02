import { createLogger } from '../utils/logger.js';

const log = createLogger('recommendationNotification');

export interface RecommendationNotification {
  senderId: string;
  recipientId: string;
  postId: string;
}

/**
 * Tells a friend they received a recommendation (UC-20,
 * docs/features/direct-recommendations.md §4.8).
 *
 * A stub: it only logs, ids only. This is the single place a real channel (an
 * in-app inbox, push) plugs in; the Friends tab's badge is what users see today.
 */
export function notifyRecommendation(notification: RecommendationNotification): void {
  log.info(
    {
      senderId: notification.senderId,
      recipientId: notification.recipientId,
      postId: notification.postId,
    },
    'Recommendation notification (stub)',
  );
}
