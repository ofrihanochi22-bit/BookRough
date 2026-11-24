import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicPost } from '../api/posts';
import {
  httpError,
  makePendingPost,
  makePost,
  makeSession,
  networkError,
  resetAuthStore,
  setOnline,
} from '../test/fixtures';
import { useAuthStore } from './auth';
import { registerAutoRetry, startAutoRetryRunner, useAutoRetry } from './autoRetry';

/*
 * The sender's automatic conversion attempts — conversion-auto-retry.md §5.1,
 * §7 "Component". The API is mocked; timers are fake and jitter is zero.
 */
const { retryConversion, toastError } = vi.hoisted(() => ({
  retryConversion: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../api/posts', () => ({ retryConversion }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

const SAVED_AT = new Date('2026-11-24T10:00:00.000Z');
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** The signed-in user's own pending post, saved at SAVED_AT. */
function mine(overrides: Partial<PublicPost> = {}): PublicPost {
  return makePendingPost({
    isMine: true,
    autoRetriesLeft: 4,
    createdAt: SAVED_AT.toISOString(),
    ...overrides,
  });
}

/** The answer after an attempt: still pending with `left` attempts left. */
const stillPending = (post: PublicPost, left: number) => ({ ...post, autoRetriesLeft: left });

/** Moves the clock to `ms` after SAVED_AT, running whatever comes due. */
async function at(ms: number) {
  await vi.advanceTimersByTimeAsync(SAVED_AT.getTime() + ms - Date.now());
}

let stop: () => void = () => undefined;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(SAVED_AT);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  setOnline(true);
  useAuthStore.getState().setSession(makeSession());
  useAutoRetry.getState().clear();
  stop = startAutoRetryRunner();
});

afterEach(() => {
  stop();
  useAutoRetry.getState().clear();
  resetAuthStore();
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the automatic-retry runner', () => {
  it('fires at 15 s with {automatic: true}; converted, it hands the post on and stops', async () => {
    // Arrange
    const post = mine();
    const converted = makePost({ id: post.id, isMine: true });
    retryConversion.mockResolvedValue(converted);
    registerAutoRetry(post);

    // Act
    await at(15 * SECOND - 1);
    const before = retryConversion.mock.calls.length;
    await at(15 * SECOND);

    // Assert
    expect(before).toBe(0);
    expect(retryConversion).toHaveBeenCalledWith(post.id, { automatic: true });
    expect(useAutoRetry.getState().updated[post.id]).toEqual(converted);
    expect(useAutoRetry.getState().entries).toEqual({});
    await at(10 * MINUTE);
    expect(retryConversion).toHaveBeenCalledTimes(1);
  });

  it('still pending: fires again at 45 s, then 2 min, then 5 min, then stops', async () => {
    // Arrange
    const post = mine();
    retryConversion
      .mockResolvedValueOnce(stillPending(post, 3))
      .mockResolvedValueOnce(stillPending(post, 2))
      .mockResolvedValueOnce(stillPending(post, 1))
      .mockResolvedValueOnce(stillPending(post, 0));
    registerAutoRetry(post);

    // Act & Assert
    const callsAt = async (ms: number) => {
      await at(ms);
      return retryConversion.mock.calls.length;
    };
    expect(await callsAt(15 * SECOND)).toBe(1);
    expect(await callsAt(45 * SECOND - 1)).toBe(1);
    expect(await callsAt(45 * SECOND)).toBe(2);
    expect(await callsAt(2 * MINUTE)).toBe(3);
    expect(await callsAt(5 * MINUTE)).toBe(4);
    expect(await callsAt(30 * MINUTE)).toBe(4);
    expect(useAutoRetry.getState().entries).toEqual({});
    expect(useAutoRetry.getState().updated[post.id]?.autoRetriesLeft).toBe(0);
  });

  it('adds up to 3 s of jitter to each attempt', async () => {
    // Arrange
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const post = mine();
    retryConversion.mockResolvedValue(stillPending(post, 3));
    registerAutoRetry(post);

    // Act & Assert
    await at(16_499);
    expect(retryConversion).not.toHaveBeenCalled();
    await at(16_500);
    expect(retryConversion).toHaveBeenCalledTimes(1);
  });

  it("resumes from the server's count: 2 left is the 2-min slot, and an overdue one runs at once", async () => {
    // Arrange: the app reopens 3 minutes after the post was saved.
    vi.setSystemTime(SAVED_AT.getTime() + 3 * MINUTE);
    const post = mine({ autoRetriesLeft: 2 });
    retryConversion.mockResolvedValueOnce(stillPending(post, 1));

    // Act
    registerAutoRetry(post);
    await vi.advanceTimersByTimeAsync(0);

    // Assert: the 2-min slot ran at once; the 5-min one keeps its place.
    expect(retryConversion).toHaveBeenCalledTimes(1);
    expect(useAutoRetry.getState().entries[post.id]?.dueAt).toBe(SAVED_AT.getTime() + 6 * MINUTE);
  });

  it("never registers someone else's post, a converted one, or one with no attempts left", async () => {
    // Act
    registerAutoRetry(mine({ id: 'theirs', isMine: false }));
    registerAutoRetry(makePost({ id: 'converted', isMine: true }));
    registerAutoRetry(mine({ id: 'spent', autoRetriesLeft: 0 }));
    await at(10 * MINUTE);

    // Assert
    expect(useAutoRetry.getState().entries).toEqual({});
    expect(retryConversion).not.toHaveBeenCalled();
  });

  it('registers nothing when signed out, and sign-out clears what is running', async () => {
    // Arrange
    registerAutoRetry(mine({ id: 'kept' }));

    // Act
    useAuthStore.getState().clear();
    registerAutoRetry(mine({ id: 'after' }));
    await at(10 * MINUTE);

    // Assert
    expect(useAutoRetry.getState().entries).toEqual({});
    expect(retryConversion).not.toHaveBeenCalled();
  });

  it('pauses while offline and fires when the app is back online', async () => {
    // Arrange
    const post = mine();
    retryConversion.mockResolvedValue(stillPending(post, 3));
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    registerAutoRetry(post);

    // Act
    await at(1 * MINUTE);
    const whileOffline = retryConversion.mock.calls.length;
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    expect(whileOffline).toBe(0);
    expect(retryConversion).toHaveBeenCalledTimes(1);
  });

  it('pauses while the page is hidden and fires when it is shown', async () => {
    // Arrange
    const post = mine();
    retryConversion.mockResolvedValue(stillPending(post, 3));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    registerAutoRetry(post);

    // Act
    await at(1 * MINUTE);
    const whileHidden = retryConversion.mock.calls.length;
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    expect(whileHidden).toBe(0);
    expect(retryConversion).toHaveBeenCalledTimes(1);
  });

  it.each([404, 409, 429])('drops the post on %i, with no toast', async (status) => {
    // Arrange
    const post = mine();
    retryConversion.mockRejectedValue(httpError(status, 'No'));
    registerAutoRetry(post);

    // Act
    await at(10 * MINUTE);

    // Assert
    expect(retryConversion).toHaveBeenCalledTimes(1);
    expect(useAutoRetry.getState().entries).toEqual({});
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    ['a network error', networkError()],
    ['a 5xx', httpError(503, 'Unavailable')],
  ])('on %s, spends the slot on this side and schedules the next', async (_what, error) => {
    // Arrange
    const post = mine();
    retryConversion.mockRejectedValueOnce(error).mockResolvedValueOnce(stillPending(post, 2));
    registerAutoRetry(post);

    // Act
    await at(15 * SECOND);
    const entry = useAutoRetry.getState().entries[post.id];
    await at(45 * SECOND);

    // Assert
    expect(entry).toMatchObject({ retriesLeft: 3, dueAt: SAVED_AT.getTime() + 45 * SECOND });
    expect(retryConversion).toHaveBeenCalledTimes(2);
  });

  it('runs one attempt at a time, in due order', async () => {
    // Arrange: two posts due together; the first attempt is held open.
    const first = mine({ id: 'first' });
    const second = mine({
      id: 'second',
      createdAt: new Date(SAVED_AT.getTime() + 1).toISOString(),
    });
    let finish: (post: PublicPost) => void = () => undefined;
    retryConversion
      .mockReturnValueOnce(new Promise<PublicPost>((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(stillPending(second, 3));
    registerAutoRetry(second);
    registerAutoRetry(first);

    // Act
    await at(20 * SECOND);
    const whileFirstRuns = retryConversion.mock.calls.map(([id]) => id as string);
    finish(stillPending(first, 3));
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    expect(whileFirstRuns).toEqual(['first']);
    expect(retryConversion.mock.calls.map(([id]) => id as string)).toEqual(['first', 'second']);
  });

  it('keeps the schedule of a post already registered', async () => {
    // Arrange
    const post = mine();
    registerAutoRetry(post);
    const entry = useAutoRetry.getState().entries[post.id];

    // Act: a list returns the same post again.
    registerAutoRetry({ ...post, autoRetriesLeft: 1 });

    // Assert
    expect(useAutoRetry.getState().entries[post.id]).toBe(entry);
  });
});
