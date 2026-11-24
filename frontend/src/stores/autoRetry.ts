import { isAxiosError } from 'axios';
import { create } from 'zustand';

import { type PublicPost, retryConversion } from '../api/posts';
import { AUTO_RETRY_JITTER_MS, nextAttemptAt, wantsAutoRetry } from '../lib/autoRetry';
import { useAuthStore } from './auth';

/** One of the sender's pending posts the app is still trying (conversion-auto-retry.md §5.1). */
export interface AutoRetryEntry {
  /** The server's `createdAt`, so the phone's clock only shifts it by the skew (§6). */
  savedAt: number;
  retriesLeft: number;
  dueAt: number;
}

interface AutoRetryState {
  entries: Record<string, AutoRetryEntry>;
  /** The latest answer of an automatic attempt, per post, for the cards showing it. */
  updated: Record<string, PublicPost>;
  /**
   * Starts trying the post if it is the viewer's own, pending, with attempts
   * left. A post already being tried keeps its schedule.
   */
  register: (post: PublicPost) => void;
  clear: () => void;
}

const jitter = () => Math.random() * AUTO_RETRY_JITTER_MS;

export const useAutoRetry = create<AutoRetryState>((set, get) => ({
  entries: {},
  updated: {},
  register: (post) => {
    if (!wantsAutoRetry(post) || !useAuthStore.getState().user || get().entries[post.id]) {
      return;
    }
    const savedAt = Date.parse(post.createdAt);
    const entry = {
      savedAt,
      retriesLeft: post.autoRetriesLeft,
      dueAt: nextAttemptAt(savedAt, post.autoRetriesLeft, jitter()),
    };
    set((state) => ({ entries: { ...state.entries, [post.id]: entry } }));
  },
  clear: () => set({ entries: {}, updated: {} }),
}));

/** Registers a post from outside React: a send or post that just returned. */
export function registerAutoRetry(post: PublicPost): void {
  useAutoRetry.getState().register(post);
}

// Sign-out and every 401 clear the auth store: nothing of the session keeps retrying.
useAuthStore.subscribe((state) => {
  if (!state.user && Object.keys(useAutoRetry.getState().entries).length > 0) {
    useAutoRetry.getState().clear();
  }
});

function removeEntry(postId: string): void {
  useAutoRetry.setState((state) => {
    const { [postId]: _removed, ...entries } = state.entries;
    return { entries };
  });
}

/** Spends one attempt on this side; with none left the post leaves the map. */
function reschedule(postId: string, retriesLeft: number, finishedAt: number): void {
  const entry = useAutoRetry.getState().entries[postId];
  if (!entry) {
    return;
  }
  if (retriesLeft <= 0) {
    removeEntry(postId);
    return;
  }
  const dueAt = nextAttemptAt(entry.savedAt, retriesLeft, jitter(), finishedAt);
  useAutoRetry.setState((state) => ({
    entries: { ...state.entries, [postId]: { ...entry, retriesLeft, dueAt } },
  }));
}

/** One attempt: the result decides whether the post stays in the map (§5.1). */
async function attempt(postId: string, entry: AutoRetryEntry): Promise<void> {
  try {
    const post = await retryConversion(postId, { automatic: true });
    useAutoRetry.setState((state) => ({ updated: { ...state.updated, [postId]: post } }));
    if (post.conversionPending) {
      reschedule(postId, post.autoRetriesLeft, Date.now());
    } else {
      removeEntry(postId);
    }
  } catch (caught) {
    const status = isAxiosError(caught) ? caught.response?.status : undefined;
    if (status === 404 || status === 409 || status === 429) {
      // Gone, converted by someone else, already running elsewhere, or no attempts left.
      removeEntry(postId);
    } else {
      // No answer or a 5xx: the slot counts on this side only; the server's
      // count is the truth on the next load.
      reschedule(postId, entry.retriesLeft - 1, Date.now());
    }
  }
}

let started = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function canRun(): boolean {
  return (
    navigator.onLine && document.visibilityState !== 'hidden' && !useAuthStore.getState().offline
  );
}

function earliest(): [string, AutoRetryEntry] | undefined {
  let found: [string, AutoRetryEntry] | undefined;
  for (const pair of Object.entries(useAutoRetry.getState().entries)) {
    if (!found || pair[1].dueAt < found[1].dueAt) {
      found = pair;
    }
  }
  return found;
}

/** Sets one timer for the earliest due attempt; none while offline, hidden or busy. */
function schedule(): void {
  clearTimeout(timer);
  timer = undefined;
  const next = earliest();
  if (!started || running || !next || !canRun()) {
    return;
  }
  timer = setTimeout(() => void runDue(), Math.max(0, next[1].dueAt - Date.now()));
}

/** At most one of the sender's attempts at a time, in due order. */
async function runDue(): Promise<void> {
  timer = undefined;
  const next = earliest();
  if (!next || !canRun() || next[1].dueAt > Date.now()) {
    schedule();
    return;
  }
  running = true;
  try {
    await attempt(next[0], next[1]);
  } finally {
    running = false;
    schedule();
  }
}

/**
 * Starts the app-level runner (one for the whole app, so attempts go on across
 * screens). Pauses while offline or hidden and resumes on `online` and
 * `visibilitychange`. Returns the stop function.
 */
export function startAutoRetryRunner(): () => void {
  started = true;
  const unsubscribe = useAutoRetry.subscribe((state, previous) => {
    if (state.entries !== previous.entries) {
      schedule();
    }
  });
  window.addEventListener('online', schedule);
  window.addEventListener('offline', schedule);
  document.addEventListener('visibilitychange', schedule);
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (state.offline !== previous.offline) {
      schedule();
    }
  });
  schedule();
  return () => {
    started = false;
    unsubscribe();
    unsubscribeAuth();
    window.removeEventListener('online', schedule);
    window.removeEventListener('offline', schedule);
    document.removeEventListener('visibilitychange', schedule);
    clearTimeout(timer);
    timer = undefined;
  };
}
