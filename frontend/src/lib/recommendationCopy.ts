import { isolate } from './bidi';

/** Copy for direct recommendations — docs/features/direct-recommendations.md §5. */
export const SEND_FAILED = "Couldn't send. Check your connection and try again.";
export const RECIPIENT_GONE = 'This person is no longer available.';
export const LOAD_FAILED = "Couldn't load your recommendations.";
export const OFFLINE = "You're offline. Connect to send or change anything.";

export function sentTo(name: string): string {
  return `Sent to ${isolate(name)}`;
}

export function noLongerFriends(name: string): string {
  return `You're no longer friends with ${isolate(name)}`;
}

export function deleteDirectBody(name: string): string {
  return `Delete this recommendation? ${isolate(name)} will lose it too, with any rating. They won't be notified.`;
}

/** From communities — docs/features/community-unchecked.md §5. */
export const COMMUNITY_EMPTY_TITLE = "You're all caught up";
export const COMMUNITY_EMPTY_BODY =
  'New posts from your communities appear here until you check them.';
export const COMMUNITY_LOAD_FAILED = "Couldn't load posts from your communities.";
export const CHECKED = 'Marked as checked';
export const CHECK_FAILED = "Couldn't mark it checked.";
export const UNDO_FAILED = "Couldn't undo. Check your connection and try again.";

/** The pill's label: short enough for a third of a 375px screen. */
export function communityPill(count: number): string {
  return count > 0 ? `Communities · ${count}` : 'Communities';
}

/** The archive — docs/features/archive-recommendations.md §5. */
export const ARCHIVED = 'Archived';
export const ARCHIVE_FAILED = "Couldn't archive this. Check your connection and try again.";
export const UNARCHIVED = 'Back in Received';
export const UNARCHIVE_FAILED = "Couldn't unarchive this. Check your connection and try again.";
export const ARCHIVE_EMPTY_TITLE = 'Nothing archived';
export const ARCHIVE_EMPTY_BODY = 'Recommendations you archive from Received appear here.';
export const ARCHIVE_LOAD_FAILED = "Couldn't load your archive.";

/** The row at the top of Received that opens the archive. */
export function archivedRow(count: number): string {
  return `Archived · ${count}`;
}
