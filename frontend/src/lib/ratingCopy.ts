/** Rating outcomes (docs/features/rate-post.md §5.2, UC-13). */
export const RATED = 'Rating submitted';
export const RATING_UPDATED = 'Rating updated';
export const RATINGS_FAILED = 'Could not load comments at this time.';
export const ALREADY_RATED = 'You already rated this post.';
export const RATED_POST_DELETED =
  'This recommendation is no longer available as the original post was deleted.';
export const RATE_FAILED = "Couldn't submit your rating. Check your connection and try again.";
export const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** "★ 7.5 · 4 ratings" (post-detail.md §5.1); null when nobody has rated. */
export function ratingSummaryLine(summary: {
  average: number | null;
  count: number;
}): string | null {
  if (summary.average === null || summary.count === 0) {
    return null;
  }
  return `★ ${summary.average} · ${summary.count} ${summary.count === 1 ? 'rating' : 'ratings'}`;
}
