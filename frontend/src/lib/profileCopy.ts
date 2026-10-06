/** Copy for Search and Public Profile — docs/features/find-people.md §5. */
export const SEARCH_HINT = 'Find friends by their display name.';
export const SEARCH_EMPTY = 'No users found matching this search. Try a different name.';
export const SEARCH_MORE = 'Showing the first 20. Type more of the name to narrow it down.';
export const SEARCH_FAILED = "Couldn't search right now.";
export const SEARCH_OFFLINE = "You're offline. Connect to search.";
export const PROFILE_FAILED = "Couldn't load this profile.";
export const RATINGS_LOAD_FAILED = "Couldn't load ratings.";

export function ratingsEmptyHint(name: string): string {
  return `You'll see ${name}'s ratings from the communities you share.`;
}
