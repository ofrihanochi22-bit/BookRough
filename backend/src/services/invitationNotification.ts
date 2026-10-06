import { createLogger } from '../utils/logger.js';

const log = createLogger('invitationNotification');

export interface InvitationNotification {
  communityId: string;
  userId: string;
  invitedById: string;
}

/**
 * Tells a friend they were invited to a community (docs/features/invite-friends.md §4).
 * A stub: it only logs, ids only. The Friends tab's badge is what users see
 * today; this is the single place a real channel plugs in.
 */
export function notifyInvitation(notification: InvitationNotification): void {
  log.info(
    {
      communityId: notification.communityId,
      userId: notification.userId,
      invitedById: notification.invitedById,
    },
    'Invitation notification (stub)',
  );
}
