/** Copy for direct recommendations — docs/features/direct-recommendations.md §5. */
export const SEND_FAILED = "Couldn't send. Check your connection and try again.";
export const RECIPIENT_GONE = 'This person is no longer available.';
export const LOAD_FAILED = "Couldn't load your recommendations.";
export const OFFLINE = "You're offline. Connect to send or change anything.";
export const HIDDEN = 'Hidden from Received';
export const HIDE_FAILED = "Couldn't hide this. Check your connection and try again.";

export function sentTo(name: string): string {
  return `Sent to ${name}`;
}

export function noLongerFriends(name: string): string {
  return `You're no longer friends with ${name}`;
}

export function hideBody(name: string): string {
  return `Hide this from Received? ${name} won't be told.`;
}

export function deleteDirectBody(name: string): string {
  return `Delete this recommendation? ${name} will lose it too, with any rating. They won't be notified.`;
}
