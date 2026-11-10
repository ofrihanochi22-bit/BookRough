import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { Friendship } from '../api/friends';
import { searchUsers, type SearchResults, type SearchUser } from '../api/profiles';
import { FriendButton } from '../components/FriendButton';
import { PersonLink } from '../components/PersonLink';
import { EmptyState as KitEmptyState } from '../components/ui/EmptyState';
import { LineIcon } from '../components/ui/LineIcon';
import { LoadError } from '../components/ui/LoadError';
import { ScreenLayout } from '../components/ui/ScreenLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { TopBar } from '../components/ui/TopBar';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useRequest } from '../hooks/useRequest';
import {
  SEARCH_EMPTY,
  SEARCH_FAILED,
  SEARCH_HINT,
  SEARCH_MORE,
  SEARCH_OFFLINE,
} from '../lib/profileCopy';
import { useAuthStore } from '../stores/auth';
import { useMixtape } from '../stores/design';

/** How long typing must pause before the search runs. */
const SEARCH_DEBOUNCE_MS = 300;

const noSearch = (): Promise<SearchResults | null> => Promise.resolve(null);

/**
 * Global Search — docs/features/find-people.md §5.1 (UC-5), with a friend
 * control on each row (search-friend-button.md §5.1). Searches as you
 * type; the query lives in the URL so Back from a profile restores it.
 * `useRequest` drops a late answer to an older query, so the newest wins.
 */
export function Search() {
  const [params, setParams] = useSearchParams();
  // Trimmed, so a hand-edited ?q=%20 reads as no search rather than a 422.
  const query = (params.get('q') ?? '').trim();
  const [value, setValue] = useState(query);
  const online = useOnlineStatus();
  const viewerId = useAuthStore((state) => state.user?.id);
  const field = useRef<HTMLInputElement>(null);
  const mixtape = useMixtape();
  // The query this screen last wrote, to tell it apart from a navigation.
  const written = useRef(query);

  useEffect(() => {
    field.current?.focus();
  }, []);

  // Another navigation (the Search tab tapped again) resets the field.
  useEffect(() => {
    if (query !== written.current) {
      written.current = query;
      setValue(query);
    }
  }, [query]);

  useEffect(() => {
    const next = value.trim();
    if (next === written.current) {
      return;
    }
    const timer = setTimeout(() => {
      written.current = next;
      setParams(next ? { q: next } : {}, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, setParams]);

  const load = useCallback(() => (query ? searchUsers(query) : noSearch()), [query]);
  const results = useRequest(load);
  // Each row's answer from the server after an action, for the results they
  // were made on: a new search or a reload starts from its own data (§5.1).
  const [changed, setChanged] = useState<{
    base: SearchResults;
    values: Record<string, Friendship>;
  } | null>(null);
  const loaded = results.status === 'ready' ? results.data : null;
  const friendshipOf = (user: SearchUser): Friendship =>
    (changed && changed.base === loaded ? changed.values[user.id] : undefined) ?? user.friendship;
  function setRowFriendship(userId: string, value: Friendship) {
    if (!loaded) {
      return;
    }
    setChanged((previous) => ({
      base: loaded,
      values: { ...(previous?.base === loaded ? previous.values : {}), [userId]: value },
    }));
  }

  const input = (
    <input
      ref={field}
      id="people-search"
      type="search"
      placeholder="Display name"
      autoComplete="off"
      enterKeyHint="search"
      maxLength={200}
      value={value}
      disabled={!online}
      onChange={(event) => setValue(event.target.value)}
      className={
        mixtape
          ? 'min-h-12 w-full rounded-full border-[1.5px] border-line bg-surface pr-4 pl-11 text-base text-ink outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50'
          : 'mb-6 mt-4 min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base disabled:opacity-50'
      }
    />
  );

  return (
    <ScreenLayout>
      {mixtape && <TopBar />}
      <h1
        className={`font-display text-2xl ${mixtape ? 'font-bold tracking-[-0.01em]' : 'font-medium'}`}
      >
        Search
      </h1>

      <label htmlFor="people-search" className="sr-only">
        Search people
      </label>
      {mixtape ? (
        // A pill field with a leading search icon (ui-redesign.md §5.7).
        <div className="relative mt-4 mb-6">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">
            <LineIcon>
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.5-4.5" />
            </LineIcon>
          </span>
          {input}
        </div>
      ) : (
        input
      )}

      <div className="flex flex-col gap-4">
        {!online && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {SEARCH_OFFLINE}
          </p>
        )}

        {!query && <p className="text-sm text-muted">{SEARCH_HINT}</p>}

        {query && results.status === 'loading' && (
          <div role="status" aria-label="Searching" className="flex flex-col gap-3">
            <Skeleton className={mixtape ? 'h-14' : 'h-11'} />
            <Skeleton className={mixtape ? 'h-14' : 'h-11'} />
            <Skeleton className={mixtape ? 'h-14' : 'h-11'} />
          </div>
        )}

        {query && results.status === 'error' && (
          <LoadError message={SEARCH_FAILED} onRetry={results.reload} />
        )}

        {results.status === 'ready' && results.data && (
          <>
            {results.data.users.length === 0 ? (
              mixtape ? (
                <KitEmptyState>{SEARCH_EMPTY}</KitEmptyState>
              ) : (
                <p className="text-sm text-muted">{SEARCH_EMPTY}</p>
              )
            ) : (
              <ul
                aria-label="Results"
                className={
                  mixtape
                    ? 'flex flex-col divide-y divide-line rounded-[22px] bg-surface px-4'
                    : 'flex flex-col'
                }
              >
                {results.data.users.map((user) => {
                  const friendship = friendshipOf(user);
                  return (
                    <li
                      key={user.id}
                      className={`flex items-center gap-3 ${mixtape ? 'py-1.5' : 'py-1'}`}
                    >
                      <PersonLink
                        user={user}
                        avatarSize={36}
                        className="text-sm font-medium"
                        label={
                          <>
                            {user.displayName}
                            {user.id === viewerId && <span className="text-muted"> · You</span>}
                          </>
                        }
                      />
                      {user.id !== viewerId &&
                        (friendship === 'FRIENDS' ? (
                          // A label, not a button: Remove lives on the profile (§5.1).
                          <span className="shrink-0 text-sm text-muted">
                            <span aria-hidden="true">✓ </span>Friends
                          </span>
                        ) : (
                          <FriendButton
                            userId={user.id}
                            name={user.displayName}
                            friendship={friendship}
                            online={online}
                            onChanged={(value) => setRowFriendship(user.id, value)}
                            onStale={results.reload}
                            emphasis="row"
                            className="shrink-0 whitespace-nowrap"
                          />
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
            {results.data.hasMore && <p className="text-sm text-muted">{SEARCH_MORE}</p>}
          </>
        )}
      </div>
    </ScreenLayout>
  );
}
