import type { PublicNotification } from '../api/notifications';

export const NOTIFICATIONS_LOAD_FAILED = "Couldn't load your notifications.";
export const MORE_FAILED = "Couldn't load more notifications.";
export const MARK_ALL_FAILED = "Couldn't mark them as read. Try again.";
export const NOTIFICATIONS_OFFLINE = "You're offline. Connect to mark them as read.";

/** The sentence after the actor's name, and the screen it opens (notifications.md §5.4). */
export interface NotificationView {
  /** Bold at the start: the actor, or "3 new posts" for a group. */
  lead: string;
  rest: string;
  to: string;
}

export function viewOf(item: PublicNotification): NotificationView {
  const actor = item.actor.displayName;
  const community = item.community?.name ?? 'a community';
  const title = item.post?.title ?? null;

  switch (item.type) {
    case 'COMMUNITY_POSTS':
      return {
        lead: item.count > 1 ? `${item.count} new posts` : actor,
        rest:
          item.count > 1 ? ` in ${community} · latest from ${actor}` : ` posted in ${community}`,
        to: `/communities/${item.community?.id ?? ''}`,
      };
    case 'RECOMMENDATION':
      return {
        lead: actor,
        rest: title ? ` sent you ${title}` : ' sent you a song',
        to: '/recommendations',
      };
    case 'RATING': {
      const score = item.score === null ? '' : ` ${item.score}/10`;
      return {
        lead: actor,
        rest: title ? ` rated ${title}${score}` : ` rated your post${score}`,
        to: `/posts/${item.post?.id ?? ''}`,
      };
    }
    case 'FRIEND_REQUEST':
      return { lead: actor, rest: ' sent you a friend request', to: '/friends' };
    case 'FRIEND_ACCEPTED':
      return {
        lead: actor,
        rest: ' accepted your friend request',
        to: `/users/${item.actor.id}`,
      };
    case 'COMMUNITY_INVITATION':
      return { lead: actor, rest: ` invited you to ${community}`, to: '/friends' };
  }
}

/** The bell's accessible name. */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
}
