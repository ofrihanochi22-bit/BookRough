import { describe, expect, it } from 'vitest';

import { makePendingPost, makePost } from '../test/fixtures';
import { isNewerAttempt, isStillLooking, nextAttemptAt, wantsAutoRetry } from './autoRetry';

const SAVED = Date.parse('2026-11-24T10:00:00.000Z');
const S = 1_000;

describe('nextAttemptAt (conversion-auto-retry.md §5.1)', () => {
  it.each([
    [4, 15 * S],
    [3, 45 * S],
    [2, 120 * S],
    [1, 300 * S],
  ])('with %i left, is due on the schedule at +%ims', (left, delay) => {
    // Act & Assert
    expect(nextAttemptAt(SAVED, left, 0)).toBe(SAVED + delay);
  });

  it('adds the jitter', () => {
    // Act & Assert
    expect(nextAttemptAt(SAVED, 4, 2_500)).toBe(SAVED + 15 * S + 2_500);
  });

  it("after a late attempt, keeps the schedule's spacing from that moment", () => {
    // Arrange: the 45 s attempt ran at 10 minutes.
    const lastAttemptAt = SAVED + 600 * S;

    // Act & Assert: 2 min − 45 s = 75 s later, not the past 2-min mark.
    expect(nextAttemptAt(SAVED, 2, 0, lastAttemptAt)).toBe(lastAttemptAt + 75 * S);
  });

  it('after an attempt on time, stays on the schedule', () => {
    // Act & Assert
    expect(nextAttemptAt(SAVED, 3, 0, SAVED + 15 * S)).toBe(SAVED + 45 * S);
  });
});

describe('wantsAutoRetry', () => {
  it("is true only for the viewer's own pending post with attempts left", () => {
    // Act & Assert
    expect(wantsAutoRetry(makePendingPost({ isMine: true, autoRetriesLeft: 1 }))).toBe(true);
    expect(wantsAutoRetry(makePendingPost({ isMine: false, autoRetriesLeft: 4 }))).toBe(false);
    expect(wantsAutoRetry(makePendingPost({ isMine: true, autoRetriesLeft: 0 }))).toBe(false);
    expect(wantsAutoRetry(makePost({ isMine: true }))).toBe(false);
  });
});

describe('isStillLooking (§5.2)', () => {
  const post = makePendingPost({ autoRetriesLeft: 1, createdAt: new Date(SAVED).toISOString() });

  it('is true for under 10 minutes, then false', () => {
    // Act & Assert
    expect(isStillLooking(post, SAVED + 599 * S)).toBe(true);
    expect(isStillLooking(post, SAVED + 600 * S)).toBe(false);
  });

  it('is false with no attempts left, or once converted', () => {
    // Act & Assert
    expect(isStillLooking({ ...post, autoRetriesLeft: 0 }, SAVED)).toBe(false);
    expect(isStillLooking({ ...post, conversionPending: false }, SAVED)).toBe(false);
  });
});

describe('isNewerAttempt', () => {
  const held = makePendingPost({ autoRetriesLeft: 3 });

  it('takes a converted answer, or one with fewer attempts left', () => {
    // Act & Assert
    expect(isNewerAttempt(held, makePost({ id: held.id }))).toBe(true);
    expect(isNewerAttempt(held, { ...held, autoRetriesLeft: 2 })).toBe(true);
  });

  it('never goes back to an older copy', () => {
    // Act & Assert
    expect(isNewerAttempt(held, { ...held, autoRetriesLeft: 4 })).toBe(false);
    expect(isNewerAttempt(makePost(), { ...held, autoRetriesLeft: 0 })).toBe(false);
  });
});
