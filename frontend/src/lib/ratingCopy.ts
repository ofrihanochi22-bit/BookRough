/** Rating outcomes (docs/features/rate-post.md §5.2, UC-13). */
export const RATED = 'Rating submitted';
export const ALREADY_RATED = 'You already rated this post.';
export const RATED_POST_DELETED =
  'This recommendation is no longer available as the original post was deleted.';
export const RATE_FAILED = "Couldn't submit your rating. Check your connection and try again.";
export const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
