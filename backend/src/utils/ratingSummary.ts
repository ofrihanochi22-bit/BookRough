/** A post's ratings at a glance (docs/features/post-detail.md §4). */
export interface RatingSummary {
  /** One decimal, rounded half-up; null when nobody has rated. */
  average: number | null;
  count: number;
}

export const NO_RATINGS: RatingSummary = { average: null, count: 0 };

/**
 * The one rounding rule, in integers so 7.25 is 7.3 and not a float's 7.2:
 * round(10 * sum / count) half-up = floor((20 * sum + count) / (2 * count)).
 */
export function summarize(sum: number, count: number): RatingSummary {
  if (count === 0) {
    return NO_RATINGS;
  }
  return { average: Math.floor((20 * sum + count) / (2 * count)) / 10, count };
}
