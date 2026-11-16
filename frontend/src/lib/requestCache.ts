import { readSessionSnapshot } from './sessionSnapshot';

/**
 * The client-side read cache (docs/features/client-cache.md §3).
 *
 * Every keyed `useRequest` answer is kept in memory, so returning to a screen
 * shows it at once. Keys marked `persist` are also written to `localStorage`
 * for the signed-in user, so a cold launch can show them before the server has
 * woken up. Writes in `api/` remove the keys they make stale (`invalidate`);
 * sign-out and every 401 remove everything (`wipeCache`).
 */

export const CACHE_STORAGE_KEY = 'bookrough.cache.v1';
/** Most persisted entries kept on the device; the oldest go first (§3.2). */
export const MAX_PERSISTED_ENTRIES = 40;
/** A persisted entry older than this is ignored on read (§3.2). */
export const MAX_PERSISTED_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Memory is bounded too, so a long session never grows without limit. */
export const MAX_MEMORY_ENTRIES = 100;
/** Invalidations remembered for requests still in flight; older ones count as "everything". */
const MAX_LOGGED_INVALIDATIONS = 50;

interface Entry {
  data: unknown;
  savedAt: number;
  persist: boolean;
}

interface Stored {
  userId: string;
  entries: Record<string, { data: unknown; savedAt: number }>;
}

/** Matches every key: a wipe or a change of user. */
const EVERYTHING = '*';

const memory = new Map<string, Entry>();
let owner: string | null = null;
/**
 * A request remembers the sequence number current when it started. An answer
 * is cached only if no invalidation since then matches its key, because the
 * request may have read the state from before that write (§5.1).
 */
let sequence = 0;
let invalidations: { sequence: number; prefixes: readonly string[] }[] = [];
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored(): Stored | null {
  try {
    const raw = storage()?.getItem(CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Stored).userId === 'string' &&
      typeof (parsed as Stored).entries === 'object' &&
      (parsed as Stored).entries !== null
    ) {
      return parsed as Stored;
    }
    return null;
  } catch {
    return null;
  }
}

/** Writes the persisted entries now. Exported for tests; the cache calls it on its own. */
export function flushCacheWrites(): void {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  const store = storage();
  if (!store || owner === null) {
    return;
  }
  // Another tab may have signed out, or in as someone else, since this tab
  // last knew. Answers fetched with that other cookie must never be written
  // under this tab's user (§3.2).
  if (readSessionSnapshot()?.user.id !== owner) {
    return;
  }
  const persisted = [...memory.entries()]
    .filter(([, entry]) => entry.persist)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_PERSISTED_ENTRIES);
  const value: Stored = {
    userId: owner,
    entries: Object.fromEntries(
      persisted.map(([key, entry]) => [key, { data: entry.data, savedAt: entry.savedAt }]),
    ),
  };
  try {
    store.setItem(CACHE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota or private mode: the memory cache still works (§6).
  }
}

/**
 * Several answers often land together (Post Detail loads three), so the device
 * copy is written once, after them, instead of on every answer.
 */
function scheduleWrite(): void {
  if (pendingWrite === null) {
    pendingWrite = setTimeout(flushCacheWrites, 0);
  }
}

function cancelWrite(): void {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
}

function recordInvalidation(prefixes: readonly string[]): void {
  sequence += 1;
  invalidations.push({ sequence, prefixes });
  if (invalidations.length > MAX_LOGGED_INVALIDATIONS) {
    invalidations = invalidations.slice(-MAX_LOGGED_INVALIDATIONS);
  }
}

function matches(key: string, prefix: string): boolean {
  return prefix === EVERYTHING || key === prefix || key.startsWith(`${prefix}:`);
}

/**
 * Whose data the cache holds. A change of user empties memory and loads that
 * user's device copy, if there is one; another user's copy is never read.
 */
export function setCacheOwner(userId: string | null): void {
  if (userId === owner) {
    return;
  }
  cancelWrite();
  memory.clear();
  recordInvalidation([EVERYTHING]);
  owner = userId;
  if (userId === null) {
    return;
  }
  const stored = readStored();
  if (!stored || stored.userId !== userId) {
    return;
  }
  const now = Date.now();
  for (const [key, entry] of Object.entries(stored.entries)) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.savedAt === 'number' &&
      now - entry.savedAt <= MAX_PERSISTED_AGE_MS &&
      entry.data !== undefined
    ) {
      memory.set(key, { data: entry.data, savedAt: entry.savedAt, persist: true });
    }
  }
}

/** Reads an entry, and marks it recently used so the memory bound evicts others first. */
export function getCached<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (entry === undefined) {
    return undefined;
  }
  memory.delete(key);
  memory.set(key, entry);
  return entry.data as T;
}

/** Captured when a request starts, and passed back to `setCached` with its answer. */
export function cacheSequence(): number {
  return sequence;
}

/**
 * Stores an answer, unless an invalidation matching `key` (or a wipe) happened
 * since the request that produced it started (`startedAt`, from `cacheSequence`).
 */
export function setCached(key: string, data: unknown, persist: boolean, startedAt: number): void {
  const oldest = invalidations[0];
  if (oldest !== undefined && oldest.sequence > startedAt + 1) {
    // The log no longer reaches back to when this request started.
    return;
  }
  const stale = invalidations.some(
    (invalidation) =>
      invalidation.sequence > startedAt &&
      invalidation.prefixes.some((prefix) => matches(key, prefix)),
  );
  if (stale) {
    return;
  }
  memory.delete(key);
  memory.set(key, { data, savedAt: Date.now(), persist });
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const leastRecent = memory.keys().next().value;
    if (leastRecent === undefined) {
      break;
    }
    memory.delete(leastRecent);
  }
  if (persist) {
    scheduleWrite();
  }
}

/**
 * Removes every key equal to one of `prefixes` or starting with it and a colon:
 * `feed` removes `feed:a`; `post:1` removes `post:1` but not `post:10`. An empty
 * list is a write's explicit "nothing cached changes" (§3.4).
 */
export function invalidate(prefixes: readonly string[]): void {
  if (prefixes.length === 0) {
    return;
  }
  recordInvalidation(prefixes);
  let persistedRemoved = false;
  for (const key of [...memory.keys()]) {
    if (prefixes.some((prefix) => matches(key, prefix))) {
      persistedRemoved ||= memory.get(key)?.persist === true;
      memory.delete(key);
    }
  }
  if (persistedRemoved) {
    scheduleWrite();
  }
}

/** Empties memory and removes the device copy (sign-out, every 401, sign-in). */
export function wipeCache(): void {
  cancelWrite();
  memory.clear();
  recordInvalidation([EVERYTHING]);
  try {
    storage()?.removeItem(CACHE_STORAGE_KEY);
  } catch {
    // Nothing to do: the memory copy is gone either way.
  }
}
