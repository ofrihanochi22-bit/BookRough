/** Copy for friend requests — docs/features/friend-requests.md §5. */
export const ACTION_FAILED = 'Action failed. Please check your internet connection and try again.';
export const REQUEST_SENT = 'Request sent';
export const FRIENDS_LOAD_FAILED = "Couldn't load your friends.";
export const FRIENDS_OFFLINE = "You're offline. Connect to answer requests.";

export function nowFriends(name: string): string {
  return `You're now friends with ${name}.`;
}

export function requestFrom(name: string): string {
  return `${name} sent you a friend request.`;
}

/** The badge's text: the count, or "9+" above nine. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export function removeFriendBody(name: string): string {
  return `Remove ${name} from your friends? They won't be notified.`;
}

export function removedFriend(name: string): string {
  return `Removed ${name} from your friends.`;
}
