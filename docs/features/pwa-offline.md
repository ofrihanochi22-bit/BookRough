# Feature: PWA — offline reading and the update prompt

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Use cases** | None directly — every reading UC keeps working without a connection (CLAUDE.md §16)        |
| **Phase**     | 6 — Step 6.2 of `DEVELOPMENT.md`, third in the re-sliced order (`production-deploy.md` §0) |
| **Branch**    | `feat/pwa-offline`                                                                         |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☐ Tested · ☐ Merged                         |

---

## 1. Goal

With no connection, a friend opens BookRough from the home screen, lands signed in, and reads what they last loaded: the dashboard, a community feed, a post, their My List — with album art. A slim bar says they are offline, and every write action says plainly that it needs a connection; nothing is queued. When a new version is deployed, the app offers a **Reload**, so an old shell never runs indefinitely against a newer API.

## 2. Scope

**In scope**

- **`vite-plugin-pwa` 1.3.0** (dev dependency, pinned) in `generateSW` mode, with `workbox-window` (runtime, through the plugin's `virtual:pwa-register/react`). Approved 2026-10-11, option A. 1.3.0 rather than 2.0.0: 2.0.0 is a major released 2026-10-03, eight days before this spec; 1.3.0 (May 2026) supports our Vite 6. It reuses Step 6.1's `manifest.webmanifest` (`manifest: false`). Registered **only in production builds** (CLAUDE.md §16).
- **Precache the app shell** (§3.1): the built HTML, JS, CSS, fonts, icons and the manifest.
- **Runtime caching** (§3.2): `GET /api/*` network first, the saved copy only when the network fails (option A, 2026-10-11); album art cache first with an expiry.
- **Offline launch with a remembered session** (§3.3, option A, 2026-10-11).
- **Offline bar** and a designed **offline launch screen** (§5).
- **An audit of every write action** (§5.4): each is disabled offline with a plain message.
- **Update prompt** (§5.5, option A, 2026-10-11).
- **Sign-out wipes** the saved API copies and the remembered session (§3.4).
- iPhone testing on this branch's preview, as in Step 6.1 (§3.6, option A, 2026-10-11).

**Out of scope**

- Any offline write: no background sync and no outbox (`deployment.md` §6.3).
- Push notifications, periodic background sync, badges.
- Precaching data the user has not opened. Only what was loaded online is readable offline.
- An "available offline" toast on first install. It would say nothing a user can act on.
- Offline search: `GET /api/users/search` is cached like any `GET`, so a repeated query works, but a new one does not, and the screen says so through its normal error state.
- Changes to the backend. No endpoint, header or schema changes.

## 3. Data model changes

None in the database. Two pieces of state on the device, both cleared on sign-out (§3.4): the Cache Storage caches of §3.2, and the remembered session of §3.3.

### 3.1 Service worker and precache

`vite.config.ts` adds `VitePWA(pwaOptions)`. The options live in `src/pwa/config.ts`, so a unit test can check them (§7):

- `strategies: 'generateSW'`, `registerType: 'prompt'`, `injectRegister: false` (registration happens in code, §5.5), `manifest: false`, `devOptions.enabled: false`.
- `workbox.globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}']`. Fonts are already bundled through Fontsource (`google-auth.md` §5.1).
- `workbox.navigateFallback: '/index.html'`, with `navigateFallbackDenylist: [/^\/api\//]`. Every in-app route opens from the precached shell offline.
- `workbox.cleanupOutdatedCaches: true`. Old precaches are removed when a new version activates.
- No `skipWaiting` and no `clientsClaim` at install. The new version waits for the user's **Reload** (§5.5).

**Served files.** The build adds `/sw.js` and `/workbox-<hash>.js`. Both have a dot, so `vercel.json`'s SPA fallback leaves them alone. Vercel serves static files that have no hash with `max-age=0, must-revalidate`, so the browser always sees a new `sw.js`. This is checked on the preview (O9).

### 3.2 Runtime caching

| Rule                  | Matches                                                                                              | Strategy                               | Cache    | Limits                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------- |
| API reads             | Same origin, method `GET`, path `/api/*` — **except** `/api/auth/*` and `/api/health`                | `NetworkFirst`, **no network timeout** | `api`    | 200 entries, 30 days; status 200 only                         |
| Album art and avatars | Any request with `destination === 'image'` from another origin (music-service covers, Google photos) | `CacheFirst`                           | `images` | 150 entries, 60 days; statuses 0 and 200; `purgeOnQuotaError` |

- **Network first, no timeout** (option A): online, every request goes to the server exactly as today, and a response that comes back updates the saved copy. The saved copy is used only when the network fails. A cold start (8 s, `production-deploy.md` §9) is therefore waited out as today, rather than silently answered with old data.
- **Never cached:** anything that is not `GET`, `/api/auth/*` (the session, sign-in, sign-out — `deployment.md` §6.2), and `/api/health`.
- **Opaque images** (status 0) are padded to a large size by some browsers' quota accounting. `purgeOnQuotaError` lets Workbox drop the `images` cache rather than fail. 150 entries is about two weeks of a small group's posts.
- `deployment.md` §6.2 said "stale-while-revalidate" for feed responses. That is corrected in this PR: screens reload their data right after an action (a post, a bookmark), and a stale-while-revalidate answer would show the old list.

### 3.3 Remembered session (`lib/sessionSnapshot.ts`)

- **Saved** on every `setSession` (sign-in, `/auth/me`, onboarding, a profile update) to `localStorage` key `bookrough.session`: `{ user: PublicUser, needsOnboarding, isAdmin }`. The same fields every endpoint already returns through `toPublicUser` — no email, no token. The `HttpOnly` cookie is untouched.
- **Read** only by `SessionGate` (`components/RouteGuards.tsx`), and only when `GET /api/auth/me` fails **with no response** (offline, DNS, a dropped connection). A `401` still means signed out; any other response (`5xx`) keeps today's retry screen.
- If a snapshot exists, the store gets that session with a new flag, `offline: true`. Without one, the designed offline launch screen shows (§5.2).
- **Re-checked** when the browser fires `online`, and on **Try again**: `/auth/me` runs quietly. Success replaces the snapshot and clears `offline`; a `401` signs out, as today.
- **Deleted** in `clear()` — sign-out and every `401`.
- A malformed snapshot (bad JSON, a missing field) is deleted and treated as none. Storage that throws counts as no snapshot.

### 3.4 Sign-out wipes the device

`useAuthStore.clear()` (sign-out and every `401`) also deletes the remembered session and the `api` cache (`caches.delete('api')`), from the page; no custom service worker code is needed. A second person signing in on the same phone therefore never reads the first person's saved feed offline. The `images` cache and the precache hold nothing personal and stay.

### 3.5 Recovery if a broken service worker reaches production

A service worker is sticky: a broken one keeps serving its precached shell even after the server is fixed. The documented way out is a deploy with `selfDestroying: true` in `pwaOptions`, which ships a worker that unregisters itself and deletes its caches. Recorded in `deployment.md` §6.5; not used unless needed.

### 3.6 Testing on a real iPhone before merge — what the developer sets up

As in Step 6.1 (`pwa-installable.md` §3.4), option A (2026-10-11):

1. **Before each round**, Vercel → `bookrough` → Settings → Deployment Protection → **Require Log In** off → Save; back on right after.
2. **Google Cloud Console** → the Web client → **Authorized JavaScript origins**: add `https://bookrough-git-feat-pwa-offline-bookrough.vercel.app`; remove it after the merge.
3. Install the app from that preview. The app installed from Step 6.1's preview no longer works and can be deleted.
4. The "second build" check (O7): with the app installed, Claude pushes another commit to the branch; the preview's address then serves the new build.

## 4. API

No endpoint changes. Behaviour seen by the client:

- Offline, a `GET` that was loaded before answers `200` from the `api` cache. One that was never loaded fails as a network error, as today.
- Offline, every write fails as a network error. The UI never offers one (§5.4).

## 5. Screens & components

### 5.1 Offline bar (`components/OfflineBar.tsx`) — new

App-wide, at the very top, shown while `useOnlineStatus()` is false and the user is signed in:

> You're offline — showing what you last loaded.

Placeholder styling from the existing tokens (`bg-accent-soft`, `text-accent-ink`), `role="status"`, not dismissible (it disappears with the connection). The screens' own offline notes on write actions stay; the bar is about **reading**.

### 5.2 Offline launch without a remembered session

`SessionGate`, when `/auth/me` fails with no response and there is no snapshot, shows instead of "Can't reach BookRough right now":

> You're offline. Connect to open BookRough.

with **Try again**. It also retries by itself on the `online` event. A `5xx` keeps today's message.

### 5.3 Screens that were never loaded

The shell opens every route offline (§3.1). A screen whose data was never loaded shows its existing error state with **Try again**; its message becomes "You're offline, and this wasn't loaded before." when `navigator.onLine` is false. One helper, `offlineAwareMessage(message)` in `lib/`, used by `LoadError`. No per-screen copy.

### 5.4 Write actions — the audit

Every mutation in `frontend/src/api/` is listed in Stage 2 with the control that triggers it, and each control is checked for an offline state: **disabled** while offline, with the screen's existing note ("You're offline. Connect to …") or, where a screen has none, the shared note "You're offline. Connect to continue." The list to cover (from `api/*.ts`):

- Posts: create, retry conversion, delete. Bookmarks: save, remove. Ratings: rate, edit.
- Communities: create, edit details, delete, leave, remove a member, change a role, ban, unban, reset the invite link, accept an invite.
- Invitations: invite a friend, withdraw, accept, decline. Friends: request, accept, ignore, cancel, unfriend.
- Profile: save changes, re-choose the Google photo. Admin: save settings.
- **Sign out**: disabled offline ("You're offline. Connect to sign out."). The `HttpOnly` cookie cannot be cleared without the server, so pretending to sign out would leave a live session behind.

Most screens already do this (`useOnlineStatus` in 14 of them). Stage 2 fills the gaps and records each one in §9.

### 5.5 Update prompt (`components/UpdatePrompt.tsx`) — new

- Uses `useRegisterSW` from `virtual:pwa-register/react`, mounted once in `main.tsx`. That is also where the service worker is registered (production only).
- When `needRefresh` is true, a `DismissibleBar` (`components/ui/DismissibleBar.tsx`) at the top: "A new version of BookRough is ready." with a **Reload** button. **Reload** calls `updateServiceWorker(true)`: the waiting worker activates and the page reloads.
- **✕** hides it for this launch only (component state, never stored). It returns on the next launch while a version is waiting.
- **Checking for a new version**: on registration (every launch), and on every `visibilitychange` to visible (the app coming back to the foreground), through `registration.update()`. No timer.
- Shown to signed-out visitors too (Welcome), since the shell is just as stale there.

### 5.6 States

- **Loading:** unchanged. Online, the existing skeletons; offline, cached answers arrive at once.
- **Empty:** unchanged. A list that was empty when saved is shown empty.
- **Error:** §5.2 and §5.3.

## 6. Edge cases & failure modes

- **The session expired while offline.** The snapshot opens the app read-only. On reconnect, `/auth/me` answers `401` → signed out → Welcome, and the `api` cache is wiped (§3.4).
- **Signed out on another device.** There is no server-side revoke (`google-auth.md` §6), so nothing changes here.
- **A different user on the same phone** → sign-out wiped the cache and the snapshot (§3.4).
- **A deploy while the app is open** → the update bar (§5.5). The old shell keeps working meanwhile: the API is backwards-compatible within a release, and the shell's lazy chunks are precached, so an old page never asks for a deleted file.
- **A deploy that removes an endpoint** the old shell still calls → the old shell gets a `404` until Reload. Accepted; the bar is there.
- **A request in flight when the connection drops** → a network error as today. A `GET` falls back to the saved copy if one exists.
- **"Online" but the server is down** (`502`) → no fallback (a response arrived); the screens' error states show, as today. A cold start is waited out (§3.2).
- **Storage eviction.** Installed home-screen apps keep their storage; Safari tabs may lose theirs after a week unused. The app then behaves as a first visit. Accepted.
- **A user who never installs** gets the same service worker in Safari or a desktop browser. Offline reading works there too.
- **Quota** → `purgeOnQuotaError` drops the `images` cache. `api` is small (JSON, 200 entries).
- **Admin screens offline** → their `GET`s are cached like any other; saving settings is disabled (§5.4).
- **A broken service worker in production** → §3.5.
- **Development:** no service worker on `npm run dev` (`devOptions.enabled: false`). Every check runs on `npm run build && npm run preview` (CLAUDE.md §16).

## 7. Test scenarios

**Unit — frontend (Vitest)**

`pwa/config.ts` (the options object, checked without a build):

- ✅ The API rule matches `GET /api/communities` and `GET /api/communities/c1/posts`, on the app's own origin.
- ❌ The API rule does not match `POST /api/communities`, `GET /api/auth/me`, `GET /api/health`, or a `GET` to another origin's `/api/…`.
- ✅ The API rule is `NetworkFirst` with no `networkTimeoutSeconds`, and only status 200 is cacheable.
- ✅ The image rule matches a cross-origin `image` request; ❌ it does not match a same-origin image (those are precached) or a cross-origin `fetch`.
- ✅ `navigateFallback` is `/index.html`, and `/api/` is in its denylist; `registerType` is `prompt`; `manifest` is `false`; dev registration is off.

`lib/sessionSnapshot.ts`:

- ✅ Save then read returns the same session.
- ❌ Malformed JSON → `null`, and the key is removed.
- ❌ A snapshot missing `user.id` → `null`.
- ❌ Storage throws on read → `null`; on write → no error.
- ✅ `clear` removes it.

`stores/auth.ts`:

- ✅ `setSession` saves the snapshot.
- ✅ `clear` removes the snapshot and calls `caches.delete('api')` (Cache Storage mocked).
- ❌ `caches` missing (old browser, jsdom) → `clear` still succeeds.

`lib/offlineAwareMessage`:

- ✅ Offline → "You're offline, and this wasn't loaded before."; ✅ online → the screen's own message.

**Component (Vitest + RTL)**

`SessionGate`:

- ✅ `/auth/me` fails with no response, a snapshot exists → signed in, `offline: true`, children render.
- ✅ No response, no snapshot → "You're offline. Connect to open BookRough." with Try again.
- ✅ Then the `online` event → `/auth/me` runs again; success → signed in, `offline: false`.
- ❌ `401` → signed out, the snapshot removed (even if one existed).
- ❌ `503` (a response) → today's "Can't reach BookRough right now", the snapshot not used.
- ✅ Signed in from a snapshot, then `online` → `/auth/me` answers `401` → signed out.

`OfflineBar`:

- ✅ Offline and signed in → shows the message; ❌ online → nothing; ❌ signed out → nothing.

`UpdatePrompt` (with `virtual:pwa-register/react` mocked):

- ✅ `needRefresh` → shows the bar; **Reload** calls `updateServiceWorker(true)`.
- ✅ ✕ hides it; ❌ `needRefresh` false → nothing.
- ✅ `visibilitychange` to visible calls `registration.update()`; ❌ to hidden does not.

Write-action audit:

- ✅ Each control **newly** given an offline state in Stage 2 gets a test: disabled offline, with its note. (Controls that already have one keep their existing tests.)
- ✅ Sign out is disabled offline with "You're offline. Connect to sign out." (Profile).

Contracts:

- ✅ `vercel.json`: `/sw.js` and `/workbox-abc123.js` route to `web` and are not rewritten to `/index.html`.
- ✅ `manifest.test.ts`: the Step 6.1 assertion "registers no service worker" is replaced. `main.tsx` mounts `UpdatePrompt`, and nothing else calls `serviceWorker.register`.

**Integration (Supertest)** — none; the backend is unchanged.

**E2E (Playwright)** — one new golden loop, Chromium only (Playwright's service-worker support is Chromium-only). It runs against the built frontend `main.yml` already serves:

- ✅ Sign in, open a community with a post, open My List, then `context.setOffline(true)` and reload → the feed and My List render from the cache, the offline bar shows, and the post composer is disabled with its note.

**Local check (Claude, before the preview)** — `npm run build && npm run preview`. DevTools → Application: the service worker is activated; Cache Storage holds the precache, `api` and `images`, with no `/api/auth/` entry. Offline in DevTools → reload → the feed renders.

**Manual — on a real iPhone, on this branch's preview (the developer, §3.6)**

- O1. Install from Safari; launch from the icon; sign in.
- O2. Online, open the dashboard, a community feed, a post's detail and My List (album art visible).
- O3. Airplane mode on → close the app fully → relaunch → it opens signed in, the offline bar shows, and the four screens from O2 are readable with their album art.
- O4. Offline, open a screen never visited (another community, a profile) → "You're offline, and this wasn't loaded before." with Try again.
- O5. Offline, the post composer, bookmark, Rate & Review and Sign out are disabled with their notes.
- O6. Airplane mode off → the bar disappears; pull a screen's Try again or reopen it → fresh data.
- O7. Claude pushes a second build → bring the app to the foreground (or relaunch) → "A new version of BookRough is ready." → Reload → the new build (Claude names a visible marker in the commit report).
- O8. Sign out (online) → airplane mode → relaunch → "You're offline. Connect to open BookRough." — no saved feed.
- O9. Desktop: `/sw.js` on the preview is served with `cache-control` `max-age=0` (checked with `curl`).

## 8. Open questions

None at approval.

## 9. Decisions log

| Date       | Decision                                                                                                                                                                                                                                                                                  | Reason                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | Offline launch through a remembered session in `localStorage` (public user fields and two flags), used only when `/auth/me` gets no response; wiped on sign-out and `401` (option A)                                                                                                      | The only option that opens a cold offline launch on the feed while keeping "never cache auth endpoints"; what it stores is already public inside the app                                        |
| 2026-10-11 | `GET /api/*` network first with no timeout; the saved copy only when the network fails; album art cache first (option A)                                                                                                                                                                  | Screens reload right after an action; stale-while-revalidate would show the old list. A timeout would silently serve old data during a cold start                                               |
| 2026-10-11 | `vite-plugin-pwa` in `generateSW` mode, pinned to 1.3.0 (option A)                                                                                                                                                                                                                        | No service-worker code of our own to maintain; 2.0.0 is a major only eight days old                                                                                                             |
| 2026-10-11 | Update prompt: a dismissible bar with Reload; ✕ hides it until the next launch; checks on launch and on returning to the foreground (option A)                                                                                                                                            | The user chooses when to reload, so no draft is lost, and the prompt always comes back (CLAUDE.md §16)                                                                                          |
| 2026-10-11 | iPhone checks on this branch's preview, as in Step 6.1 (option A)                                                                                                                                                                                                                         | A broken service worker is sticky; it must fail on a throwaway address, not on the real installed app                                                                                           |
| 2026-10-11 | Without asking: sign-out disabled offline; sign-out wipes the `api` cache and the snapshot; no "ready for offline" toast; E2E offline loop on Chromium only                                                                                                                               | A cookie cannot be cleared offline; a shared phone must not leak the last user's feed; Playwright's service-worker support is Chromium-only                                                     |
| 2026-10-11 | Stage 2: the two route matchers inline their patterns                                                                                                                                                                                                                                     | Workbox copies them into `sw.js` as source text; a module-level constant was undefined there and would have thrown on every API request                                                         |
| 2026-10-11 | Stage 2: the offline wording lives in `LoadError` itself (`NOT_LOADED_OFFLINE`, through `useOnlineStatus`) rather than a `lib/offlineAwareMessage` helper                                                                                                                                 | One place, and it updates when the connection changes                                                                                                                                           |
| 2026-10-11 | Stage 2 audit: Sign out (Profile, Complete Your Profile) and Reset link (invite panel) gained offline states; every other mutation already had one                                                                                                                                        | `profile-settings.md` kept Sign out enabled offline; changed there too                                                                                                                          |
| 2026-10-11 | E2E now serves the build same-origin: `vite preview` proxies `/api` to the API when `PREVIEW_API_PROXY` is set (local Playwright config and `main.yml`)                                                                                                                                   | The API cache matches same-origin `/api` only, as in production; cross-origin E2E could not exercise it                                                                                         |
| 2026-10-11 | Playwright blocks service workers suite-wide (`serviceWorkers: 'block'`); only the offline test allows them                                                                                                                                                                               | Once the worker controls a page, WebKit sends its requests through it and `page.route()` no longer sees them, so the Google stand-in was bypassed after a sign-out (3 `mobile-safari` failures) |
| 2026-10-11 | Stage 3 `/code-review` (7 findings, all fixed): an unconfirmed session is read-only through `useOnlineStatus` (false while `offline`), and is re-confirmed on `online`, on returning to the foreground and every 15 s while in view; one `checkSession` shared by both paths              | The flag was set but nothing enforced it, and with the browser already "online" (a timeout) no `online` event would ever confirm it                                                             |
| 2026-10-11 | Stage 3: the `api` cache has an owner (`bookrough.apiCacheOwner`); a confirmed session for a different user deletes it first                                                                                                                                                              | A request still in flight at sign-out could write the old user's answer back after the wipe                                                                                                     |
| 2026-10-11 | Stage 3: `revokeAdmin()` replaces the two `setState({ isAdmin: false })` calls and updates the snapshot; the snapshot check validates every `PublicUser` field; a newer waiting version re-shows a dismissed update bar; `#root` is a flex column so the bars take height from the screen | Each was a way for the offline launch or the prompt to show stale or broken state                                                                                                               |
| 2026-10-11 | `vite-plugin-pwa` 1.3.0 adds 250 dev packages (Workbox's build chain) and changes no existing version; `npm audit` shows the same 8 dev-tooling advisories as `main`, 0 in production dependencies                                                                                        | Recorded for the toolchain follow-up                                                                                                                                                            |

## 10. Doc updates (same PR)

- `docs/deployment.md` + `.docx`: §6.2 — network first for `GET /api/*` (not stale-while-revalidate), the never-cached list, the `images` rule; §6.3 — offline launch through the remembered session, sign-out disabled offline; §6.4 — the update bar and when it checks; §6.5 — `selfDestroying` recovery.
- `docs/tech stack.md` + `.docx` §5: `vite-plugin-pwa` 1.3.0 and `workbox-window` — what, why, what breaks without them, no account or cost (CLAUDE.md §18).
- `docs/frontend screens.md` + `.docx`: the offline bar, the offline launch screen, the update bar (cross-cutting UI conventions).
- `docs/features/google-auth.md` §6: the installed app opens signed in offline from the remembered session.
- `DEVELOPMENT.md`: Step 6.2 per §13.
- `docs/features/pwa-installable.md`: Merged ticked (in the spec commit).
