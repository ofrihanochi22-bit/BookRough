import type { PublicPost } from '../api/posts';

/**
 * When the sender's app tries a pending post again, counted from when the post
 * was saved: 15 s, 45 s, 2 min and 5 min (conversion-auto-retry.md §5.1). The
 * server allows exactly this many automatic attempts per post.
 */
export const AUTO_RETRY_DELAYS_MS = [15_000, 45_000, 120_000, 300_000] as const;
export const MAX_AUTO_RETRIES = AUTO_RETRY_DELAYS_MS.length;
/** Up to this much is added to each attempt, so many posts saved together don't retry together. */
export const AUTO_RETRY_JITTER_MS = 3_000;
/** A pending post this old no longer says "still looking" (§5.2). */
export const STILL_LOOKING_WINDOW_MS = 10 * 60_000;

/** Which slot of the schedule comes next, given the attempts left. */
function slot(retriesLeft: number): number {
  return Math.min(MAX_AUTO_RETRIES - 1, Math.max(0, MAX_AUTO_RETRIES - retriesLeft));
}

/**
 * When the next attempt is due, as an epoch time in ms. On the schedule from
 * `savedAt`; after an attempt that ended at `lastAttemptAt`, never sooner than
 * the schedule's spacing from that moment, so attempts resumed late stay apart
 * (§6). An overdue time is simply in the past: it runs at once.
 */
export function nextAttemptAt(
  savedAt: number,
  retriesLeft: number,
  jitter: number,
  lastAttemptAt: number | null = null,
): number {
  const index = slot(retriesLeft);
  const delay = AUTO_RETRY_DELAYS_MS[index] ?? 0;
  const onSchedule = savedAt + delay;
  if (lastAttemptAt === null || index === 0) {
    return onSchedule + jitter;
  }
  const spacing = delay - (AUTO_RETRY_DELAYS_MS[index - 1] ?? 0);
  return Math.max(onSchedule, lastAttemptAt + spacing) + jitter;
}

/** The viewer's own pending post that the server still allows automatic attempts for. */
export function wantsAutoRetry(post: PublicPost): boolean {
  return post.isMine && post.conversionPending && post.autoRetriesLeft > 0;
}

/**
 * Every viewer of a pending post with attempts left, saved under 10 minutes
 * ago, is told the app is still looking (§5.2).
 */
export function isStillLooking(post: PublicPost, now: number = Date.now()): boolean {
  return (
    post.conversionPending &&
    post.autoRetriesLeft > 0 &&
    now - Date.parse(post.createdAt) < STILL_LOOKING_WINDOW_MS
  );
}

/**
 * Whether an automatic attempt's answer is newer than the post a card holds:
 * converted, or with fewer attempts left. A card never goes back to an older copy.
 */
export function isNewerAttempt(held: PublicPost, fresh: PublicPost): boolean {
  return (
    held.conversionPending &&
    (!fresh.conversionPending || fresh.autoRetriesLeft < held.autoRetriesLeft)
  );
}
