# Feature: Client-side data cache and a clearer cold start

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only. Feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Use cases** | None of its own. Changes how every read screen loads: UC-4, 5, 6, 7, 8, 9, 10, 12, 13, 16, 19, 20, 21, 22 |
| **Phase**     | 6 (improvement round, point 5)                                                                            |
| **Branch**    | `feat/client-cache`                                                                                       |
| **Status**    | ☑ Spec approved (2026-11-16) · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                           |

---

## 1. Goal

Moving between screens shows the last data at once instead of an empty skeleton, and a cold launch of the app after a quiet period shows the user's communities, feeds and lists straight away while the server wakes up in the background. When there is genuinely nothing to show yet and the wait passes 2 seconds, the screen says so in a calm line instead of looking broken. The cold start itself is measured, so a later decision about it rests on numbers.

### 1.1 Why it happens today (verified in code, 2026-11-16)

1. **No client-side cache.** Every screen loads through `useRequest` (`frontend/src/hooks/useRequest.ts`), which fetches on mount and keeps the answer only in the component's state. Leaving a screen throws it away, so Home → Community → Home shows the skeleton again until the server answers. 23 call sites use the hook.
2. **Cold starts.** The backend container on Vercel Hobby scales to zero after 5 idle minutes and Neon Free suspends its compute when idle (`docs/deployment.md` §3.6). The first request after a quiet period waits for both. On top of that, `SessionGate` (`components/RouteGuards.tsx`) shows the "Opening BookRough…" spinner until `GET /api/auth/me` answers, so a cold launch waits on the cold server before any screen renders. The image runs `prisma migrate deploy` on every container start (`backend/Dockerfile`), and nothing logs how long any of this takes.

## 2. Scope

**In scope**

- `useRequest` gains an optional cache key. A keyed request shows its cached answer at once (stale-while-revalidate), always fetches a fresh one in the background, and replaces the shown data in place when it arrives (§5.1).
- An in-memory cache for every keyed request, and a copy on the device (`localStorage`) for the user's personal lists (§3.2).
- A saved session on the device, so a cold launch opens signed in at once while `/auth/me` checks the cookie in the background (§3.3).
- A targeted invalidation map: every write in `frontend/src/api/` names the cache keys it makes stale, and a test fails if one names none (§3.4).
- Sign-out and every `401` wipe the cache and the saved session (§3.5).
- A neutral line, "Still loading. This can take a few seconds.", under any loading skeleton or spinner that has been up for 2 seconds (§5.2).
- Cold-start measurement: three timed log lines in the backend, one of which needs a change to the Dockerfile start command (approved by the developer 2026-11-16, §4).

**Out of scope**

- **TanStack Query or any new dependency.** Decided 2026-11-16: `useRequest` is extended instead.
- **The service worker** (precache, offline fallback page, update prompt, offline states on write controls). That stays Step 6.2 (`feat/pwa-offline`, unmerged). Decided 2026-11-16 that this feature does not wait for 6.2. When 6.2 next updates from `main` it adopts this feature's saved session instead of its own (§3.3 of its spec) and drops or narrows its `api` runtime cache, since the in-app cache now covers offline reading of the personal lists (§8).
- **Keep-warm pings.** Ruled out by the developer: a container kept up around the clock would exceed Hobby's 360 GB-hours of provisioned memory a month and pause the team.
- **Moving migrations out of the start command.** This feature only measures. If the logs show `prisma migrate deploy` is a large share of the cold start, that is a separate decision recorded in `docs/deployment.md`.
- **Caching later pages.** Only what `useRequest` loads, which on the paginated screens is the first page, is cached. "Load more" pages stay in screen state, as today.
- **Any visual redesign.** The new line uses the existing secondary text style.

## 3. Data model changes

None in the database. Two pieces of state on the device, both wiped on sign-out and on every `401` (§3.5).

### 3.1 Cache keys

A key is a string built by one helper module, `frontend/src/lib/cacheKeys.ts`, so the keys used by screens and by the invalidation map can never drift apart:

| Key                           | Loader                                                                            | Screen                    | On the device |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------- | ------------- |
| `communities`                 | `listMyCommunities`                                                               | Home, Share sheet         | yes           |
| `community:<id>`              | `getCommunity`                                                                    | Community (header)        | yes           |
| `feed:<communityId>`          | `listPosts(id)` (first page)                                                      | Community feed            | yes           |
| `myList`                      | `listBookmarks()` (first page)                                                    | My List                   | yes           |
| `notifications`               | `listNotifications()` (first page)                                                | Notifications             | yes           |
| `recs:received` / `recs:sent` | `listReceived()` / `listSent()`                                                   | Recommendations           | yes           |
| `friends`                     | Friends screen loader (invitations, requests, friends)                            | Friends                   | yes           |
| `friendList`                  | `listFriends`                                                                     | Send recommendation sheet | yes           |
| `post:<id>`                   | `getPost`                                                                         | Post Detail               | memory only   |
| `postRatings:<id>`            | `listPostRatings`                                                                 | Post Detail               | memory only   |
| `comments:<postId>`           | `listComments` (via `useDiscussion`)                                              | Post Detail               | memory only   |
| `profile:<userId>`            | `getProfile`                                                                      | Public Profile            | memory only   |
| `profileRatings:<userId>`     | `listProfileRatings`                                                              | Public Profile            | memory only   |
| none                          | admin, search, invite preview, community settings, invite panel, create community |                           | not cached    |

Screens without a key behave exactly as today. Admin data, search results and other people's pages never reach the device (decided 2026-11-16).

### 3.2 The cached lists on the device

- **Where:** `localStorage`, key `bookrough.cache.v1`. `localStorage` because it can be read synchronously before the first paint, and first pages are small.
- **Shape:** `{ userId, entries: { [key]: { data, savedAt } } }`. Read only when `userId` matches the signed-in (or saved) user. A different user, an unparseable value, or a different version suffix is ignored and overwritten.
- **Writes** are coalesced: answers that land together are written once, after them. A write is skipped when the saved session (§3.3) names another user than this tab's, so answers fetched with another tab's cookie are never stored under this user.
- **Limits:** at most 40 entries, oldest `savedAt` dropped first; an entry older than 14 days is ignored on read. A write that throws (quota, private mode) is swallowed: the in-memory cache still works.
- **Nothing sensitive:** the entries are the same JSON the API already sends to this user, serialised through `toPublicUser` on the server. No email exists, and no token: the session cookie is `HttpOnly` and is never readable here.

### 3.3 The saved session

- **Saved** on every `setSession` (sign-in, `/auth/me`, onboarding, a profile update) to `localStorage` key `bookrough.session.v1`: `{ user: PublicUser, needsOnboarding, isAdmin }`. The tutorial flags are not saved, so a cold launch shows no tutorial until `/auth/me` answers.
- **Read** once, when the auth store is created. If present and well formed, the store starts `signedIn` from it instead of `unknown`, so no spinner is shown.
- **Checked** by `SessionGate` in the background, every launch:
  - success → `setSession` with the server's answer (it replaces the snapshot);
  - `401` → `clear()` (§3.5), and the route guards send the user to Welcome;
  - no response, or any other status → the app stays as it is, reading from the cache. No retry screen, because a screen is already showing; each screen's own request shows its own error if it has nothing cached.
- `isAdmin` from the snapshot affects navigation only. Every admin endpoint authorises on the server (CLAUDE.md §17), as today.
- **Without a snapshot** (first launch, after sign-out) `SessionGate` behaves exactly as today, plus the line of §5.2 under its spinner.

### 3.4 The invalidation map

Every write function in `frontend/src/api/*.ts` calls `invalidate(...)` after a successful response, naming the key prefixes it makes stale. `invalidate` removes the matching entries from memory and from the device. A screen whose key was removed shows its skeleton once on the next visit and loads fresh: after the user's own action no screen ever shows the state from before it. Data changed by other people is caught by the background refresh on every visit.

| Write (api module)                                                                    | Invalidates                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create community (`communities`)                                                      | `communities`                                                                                                                                                    |
| leave, remove member, change role, transfer ownership, unblock, update (`membership`) | `communities`, `community:<id>`, `feed:<id>`                                                                                                                     |
| delete a community (`membership`)                                                     | `communities`, `community:<id>`, `feed:<id>`, `notifications`, `myList`, `recs`                                                                                  |
| accept an invite link (`invites`), accept/decline an invitation (`invitations`)       | `communities`, `notifications`, `friends` (the invitations section)                                                                                              |
| send/cancel an invitation, reset the invite link                                      | nothing cached (invite panel is not cached); declares `[]` explicitly                                                                                            |
| create a post (`posts`)                                                               | `feed:<communityId>`, `profile`, `profileRatings`                                                                                                                |
| edit a post's comment, retry conversion, delete a post (`posts`)                      | `post:<id>`, `feed`, `profile`, `profileRatings`, `myList`, `recs`                                                                                               |
| send or hide a recommendation (`recommendations`)                                     | `recs`                                                                                                                                                           |
| mark recommendations seen (`recommendations`)                                         | nothing; only the unseen count changes, and no cached list shows it. Declares `[]`                                                                               |
| rate, edit a rating (`ratings`)                                                       | `feed`, `post:<id>`, `postRatings:<id>`, `recs`, `profile`, `profileRatings`, `myList`                                                                           |
| bookmark, unbookmark (`bookmarks`)                                                    | `myList`, `feed`, `post:<id>`, `recs`                                                                                                                            |
| add a comment (`comments`)                                                            | `comments:<postId>`, `post:<id>`, `feed`                                                                                                                         |
| edit, delete a comment (`comments`; no post id at hand)                               | `comments`, `post`, `feed`                                                                                                                                       |
| friend request, accept, decline, cancel, remove (`friends`)                           | `friends`, `friendList`, `notifications`, `profile`                                                                                                              |
| mark notifications read (`notifications`)                                             | `notifications`                                                                                                                                                  |
| profile update, photo upload, Google photo, onboarding (`users`)                      | `AVATAR_KEYS`: `profile`, `profileRatings`, `friends`, `friendList`, `feed`, `post`, `postRatings`, `comments`, `recs` (names and avatars appear in all of them) |
| tutorial seen (`users`)                                                               | nothing; declares `[]` explicitly                                                                                                                                |
| admin removes a user's photo (`admin`)                                                | `AVATAR_KEYS`, as a profile update                                                                                                                               |
| admin settings (`settings`)                                                           | nothing cached; declares `[]` explicitly                                                                                                                         |
| sign-in (`auth`)                                                                      | wipes everything (§3.5), as a fresh session                                                                                                                      |
| sign-out (`auth`)                                                                     | wipes everything (§3.5)                                                                                                                                          |

A prefix without an id (`feed`) removes every key that starts with it. Coarse prefixes are deliberate where the write does not know every list the item appears in: one extra skeleton is cheaper than a stale screen. The exact list is finalised in Stage 2 against the code and kept in this table.

**Completeness test.** A unit test reads every `api/*.ts` source file and fails if a function that calls `api.post`, `api.put`, `api.patch` or `api.delete` does not also call `invalidate(` (an explicit `invalidate([])` counts). A write added later without a decision cannot pass CI.

### 3.5 Wiping

`useAuthStore.clear()` runs on sign-out and on every `401` (`onUnauthorized` in `api/client.ts`). It now also empties the in-memory cache, removes `bookrough.cache.v1` and removes `bookrough.session.v1`. A successful sign-in wipes the cache too before the new session is stored, so nothing from an earlier user can be read even if a wipe was missed. Missing or throwing `localStorage` never stops `clear()`.

## 4. API

No endpoint changes. Backend changes are measurement only.

### 4.1 Cold-start logs

Three `info` lines from the logger, context `startup`:

| Message               | Fields                  | How measured                                                                                                                                                                                                                                                                                     |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Migrations finished` | `migrateMs`             | The start command records a millisecond timestamp before and after `prisma migrate deploy` in two environment variables; Node logs the difference at start. Omitted when the variables are absent (local `npm run dev`).                                                                         |
| `API listening`       | `port`, `env`, `bootMs` | Existing line, gains `bootMs`: from the end of migrations (or from process start when absent) to `listen`.                                                                                                                                                                                       |
| `Database connected`  | `connectMs`             | After `listen`, an explicit `prisma.$connect()` is timed. A failure logs `warn` through the shared error serializer (`utils/safeError.ts`, which keeps a connection error's message: it names the host, never the credentials) and the server keeps serving, as today when the database is down. |

**Dockerfile start command** (approved 2026-11-16):

```sh
export BOOT_STARTED_AT=$(date +%s%3N) && npx prisma migrate deploy \
  && export MIGRATE_FINISHED_AT=$(date +%s%3N) && exec node dist/index.js
```

Same order, same failure behaviour (a failed migration still stops the container before it serves), same `exec`. The `test:docker` job keeps passing. The developer reads the lines in Vercel → Logs after a few cold starts; the follow-up decision on migrate-on-start is recorded in `docs/deployment.md` then.

## 5. Screens & components

### 5.1 `useRequest` with a key

`useRequest(load, { key, persist })`. Without options it behaves exactly as today.

| Situation on mount                      | Shown                                     | Then                                                                                                                                |
| --------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Key cached (memory, else device)        | `ready` with the cached data, no skeleton | Fetch in the background. Success → data replaced in place and cache updated. Failure → cached data stays, no error state, no toast. |
| Key not cached                          | `loading` (the screen's skeleton)         | As today; success also fills the cache.                                                                                             |
| `reload()` (Try again, after an action) | `loading`, as today                       | Removes the key first, so the reload is never answered from the cache.                                                              |

- **Quiet background refresh.** Every cached loader already passes `skipErrorToast` (each screen shows its own error state), so reading offline does not toast on every visit. A test keeps it that way for every loader in §3.1. A `401` still reaches `onUnauthorized` and wipes everything.
- **Screens with local state** (feed, My List, Notifications, Recommendations) reset their local changes when `first.data` changes, as they do today on reload. The fresh answer usually arrives before the user can act; if it arrives after "load more", the list restarts from the fresh first page. Accepted (§6).
- **The key changes** (another community): the new key's cache is shown, or the skeleton; an answer for the old key is never shown, as today.

### 5.2 The "still loading" line

A shared component, `LoadingHint`, renders "Still loading. This can take a few seconds." in the existing muted text style, starting 2 seconds after it mounts, with `role="status"`. It is placed under every loading skeleton of a keyed or unkeyed screen and under `SessionGate`'s "Opening BookRough…" spinner. It is never shown over cached data (decided 2026-11-16: neutral wording, because after 2 seconds a cold start and a slow network look the same).

### 5.3 Screens touched

Every screen in the table of §3.1 passes its key; nothing else in their layout changes. Loading, empty and error states stay as they are, plus §5.2 under loading. Empty state: an empty cached list renders the screen's normal empty state, then updates in place.

## 6. Edge cases & failure modes

- **Cold launch with a saved session, server asleep:** Home renders from the device at once; `/auth/me` and the communities refresh complete after the wake-up and update in place.
- **Session expired while the app was closed, shared phone:** the previous user's cached lists are visible for the seconds until `/auth/me` answers `401`, then everything is wiped and Welcome shows. Accepted 2026-11-16. A normal sign-out wipes at once, so this needs an expired cookie, not a sign-out.
- **A different user signs in on the same device:** sign-in wipes; and the cache's `userId` check ignores any leftover entries.
- **Offline launch:** the saved session and cached lists render; refreshes fail quietly; screens without a cached answer show their existing error state. Writes fail through the existing offline toast; offline states on controls stay Step 6.2.
- **The user's own action, then Back:** the action invalidated the key, so the previous screen shows its skeleton once and loads fresh, never the old list.
- **Someone else's action:** the cached list shows first and updates in place within the refresh.
- **Item deleted by someone else, visited from cache:** the refresh's `404` is treated like any refresh failure only if data is cached for a list; for a single item (Post Detail, Community) a `404` replaces the cached data with the screen's existing not-found state, so a deleted post does not linger.
- **Removed from a community while it is cached:** the refresh answers `403`/`404`; the screen shows its existing state for that, and the key is removed.
- **Answer arrives after "load more":** the list restarts from the fresh first page (§5.1). Rare, accepted.
- **`localStorage` full, disabled or throwing:** memory cache only; nothing breaks.
- **Corrupt or old-version values on the device:** ignored and overwritten.
- **API shape changes in a new release:** the `v1` suffix is bumped when a cached shape changes incompatibly; the 14-day limit caps the rest.
- **Missing `BOOT_STARTED_AT` / `MIGRATE_FINISHED_AT`** (local dev, tests): `migrateMs` is not logged; `bootMs` falls back to process uptime.

## 7. Test scenarios

**Unit: cache store (`lib/requestCache.ts`)**

- ✅ `set` then `get` returns the entry from memory.
- ✅ A persisted key is written to `bookrough.cache.v1` with `userId` and `savedAt`; a memory-only key is not.
- ✅ A fresh module reads persisted entries back for the same user.
- ❌ Entries for a different `userId` are ignored.
- ❌ An entry older than 14 days is ignored.
- ❌ Corrupt JSON in `localStorage` is ignored, and the next write replaces it.
- ❌ A `setItem` that throws (quota) leaves the memory cache working.
- ✅ More than 40 persisted entries drops the oldest.
- ✅ `invalidate(['feed'])` removes `feed:a` and `feed:b` but not `communities`, from memory and the device.
- ✅ `invalidate(['post:1'])` removes only `post:1`, not `post:10`.
- ✅ `wipe()` empties memory and removes both device keys.

**Unit: `useRequest`**

- ✅ Without options, behaves as today: loading, then ready (existing tests stay).
- ✅ With a cached key: first render is `ready` with cached data, no loading state.
- ✅ The background answer replaces the data in place and updates the cache.
- ❌ The background refresh fails: cached data stays and status stays `ready`, even if the key is invalidated afterwards.
- ✅ Every cached loader of §3.1 shows no toast when the network fails.
- ✅ Without cached data: loading, then ready, and the cache is filled.
- ❌ Without cached data, the request fails: error state, as today.
- ✅ `reload()` removes the key and shows loading.
- ❌ The key changes before the old answer arrives: the old answer is never shown or cached under the new key.
- ❌ A single-item key whose refresh answers `404`: the screen gets the error state and the key is removed.

**Unit: invalidation map**

- ✅ Completeness: every `api/*.ts` function that calls `api.post|put|patch|delete` also calls `invalidate(`.
- ✅ For each write in §3.4's table, a successful call invalidates exactly the listed prefixes (mocked axios, spied `invalidate`).
- ❌ A failed write (rejected request) invalidates nothing.

**Unit: session snapshot and wipe (`stores/auth`)**

- ✅ `setSession` saves `{ user, needsOnboarding, isAdmin }` to `bookrough.session.v1`, without the tutorial.
- ✅ A store created with a valid snapshot starts `signedIn` with that user.
- ❌ A malformed snapshot is ignored; the store starts `unknown`.
- ✅ `clear()` removes the snapshot and wipes the cache.
- ❌ `clear()` succeeds when `localStorage` throws.
- ✅ A successful sign-in wipes the cache before storing the new session.

**Component: `SessionGate`**

- ✅ With a snapshot: children render at once, and `/auth/me` runs in the background.
- ✅ With a snapshot, `/auth/me` succeeds: the session is replaced by the server's.
- ❌ With a snapshot, `/auth/me` answers `401`: the store is cleared (Welcome follows from the guards).
- ❌ With a snapshot, `/auth/me` has no response or a `5xx`: children stay rendered, no retry screen.
- ✅ Without a snapshot: the spinner, then children, as today (existing tests stay).
- ✅ Without a snapshot, the spinner shows "Still loading. This can take a few seconds." after 2 s (fake timers), not before.

**Component: screens**

- ✅ Dashboard: with cached communities, the list renders on the first render with no skeleton, then updates in place when the refresh returns a new community.
- ❌ Dashboard: with no cache and a request still pending after 2 s, the skeleton shows the "Still loading" line.
- ✅ Community feed: a cached first page renders at once; a different community id shows its own cache or the skeleton, never the other feed.
- ✅ My List: unbookmarking invalidates `myList`; mounting My List afterwards shows the skeleton and fetches.
- ❌ Post Detail: a cached post whose refresh answers `404` shows the existing not-found state.

**Backend unit**

- ✅ Startup timing: with both timestamps set, logs `Migrations finished` with their difference, and `API listening` with `bootMs`.
- ❌ Without the variables (or non-numeric), no `migrateMs` line, and `bootMs` falls back to uptime.
- ✅ `Database connected` logs `connectMs` after a successful connect.
- ❌ A failed connect logs `warn` with name and message only, and does not stop the server.

**Docker (`test:docker`, existing job)**

- ✅ The image still starts, migrates an empty database, answers health, and shuts down gracefully with the new start command.

**E2E**

- None new. The golden loops already cross every touched screen; a cache bug that breaks them fails the existing suite. The behaviour itself is covered at unit and component level.

**Manual (production build, then production)**

- Home → Community → Home: Home shows at once, no skeleton.
- Close the app for over 5 minutes, open it: Home shows the communities at once; nothing reads as broken while the server wakes.
- Join a community, go Home: the new community is there (skeleton once, never the old list).
- Sign out, sign in as another account on the same browser: nothing of the first account appears.
- Vercel → Logs after a cold start: the three `startup` lines with numbers.

## 8. Open questions

- None for this feature. Note for Step 6.2 (`feat/pwa-offline`, a later session): on updating from `main` it should adopt this feature's saved session (`bookrough.session.v1`) instead of its own `bookrough.session`, keep its sign-out wipe of Cache Storage alongside §3.5, and decide whether its `api` runtime cache is still needed.

## 9. Decisions log

| Date       | Decision                                                                                        | Reason                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Built on `main`, independent of the unmerged Step 6.2; the saved session moves here.            | The visible fix should not wait for another whole step; without a saved session a cold launch still waits on `/auth/me`.                                    |
| 2026-11-16 | Extend `useRequest`; no TanStack Query.                                                         | No new dependency; the paginated screens keep their local state, which fits a first-page cache.                                                             |
| 2026-11-16 | The user's personal lists persist on the device; admin, search, others' pages stay in memory.   | Covers the screens a cold launch opens on, and the §16 offline read, with nothing beyond what the user already sees.                                        |
| 2026-11-16 | Targeted invalidation map, enforced by a completeness test.                                     | Never stale after the user's own action, without a skeleton on every screen after every write.                                                              |
| 2026-11-16 | Open from the saved session at once, check `/auth/me` behind; wipe on sign-out and every `401`. | The cold-launch example (Home after 10 minutes) is otherwise unsolved. Accepted cost: an expired session on a shared phone shows the old lists for seconds. |
| 2026-11-16 | Neutral line "Still loading. This can take a few seconds." after 2 s, only under loading.       | A cold start and a slow network look the same at 2 s; the skeleton alone already says "loading".                                                            |
| 2026-11-16 | Measure the cold start, including a start-command change for the migrate time; no move yet.     | Decide on migrate-on-start with numbers, in `docs/deployment.md`.                                                                                           |
