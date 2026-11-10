import type { SavedPost } from '../api/bookmarks';

/**
 * Whether a saved song can be rated from My List: a community post while the
 * viewer is still a member (rate-post.md §5.1), a direct recommendation while
 * the two are friends (direct-recommendations.md §5.5). The card's Rate &
 * Review and the list tip (onboarding-tutorial.md §5.2) both follow it.
 */
export function canRateSaved(saved: SavedPost): boolean {
  return saved.isMember || saved.post.direct?.isFriend === true;
}
