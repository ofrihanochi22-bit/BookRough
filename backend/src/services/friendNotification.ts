import { createLogger } from '../utils/logger.js';

const log = createLogger('friendNotification');

export interface FriendNotification {
  requesterId: string;
  addresseeId: string;
}

/**
 * Tells someone they have a friend request (UC-6), and a sender that it was
 * accepted (UC-7) — docs/features/friend-requests.md §4.4.
 *
 * Stubs: they only log, ids only. This is the single place a real channel (an
 * in-app inbox, push) plugs in; the Friends tab's badge is what users see today.
 */
export function notifyFriendRequest(notification: FriendNotification): void {
  log.info(
    { requesterId: notification.requesterId, addresseeId: notification.addresseeId },
    'Friend request notification (stub)',
  );
}

export function notifyFriendAccepted(notification: FriendNotification): void {
  log.info(
    { requesterId: notification.requesterId, addresseeId: notification.addresseeId },
    'Friend accepted notification (stub)',
  );
}
