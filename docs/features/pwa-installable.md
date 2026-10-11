# Feature: PWA — installable

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Use cases** | None directly — every UC becomes usable from the iPhone home screen (CLAUDE.md §1, §16)     |
| **Phase**     | 6 — Step 6.1 of `DEVELOPMENT.md`, second in the re-sliced order (`production-deploy.md` §0) |
| **Branch**    | `feat/pwa-installable`                                                                      |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                          |

---

## 1. Goal

A friend opens `https://bookrough.vercel.app` in Safari on an iPhone, sees a short hint telling them how to install it, taps **Share → Add to Home Screen**, and gets a **BookRough** icon. Launched from that icon, the app opens full-screen with no browser chrome, signs in with Google inside the installed app, and runs the whole golden loop there. Desktop and Android browsers see a valid manifest too.

## 2. Scope

**In scope**

- `frontend/public/manifest.webmanifest`, hand-written and linked from `index.html` (§3.1). **No new dependency** (decided 2026-10-11, option A): `vite-plugin-pwa` arrives in Step 6.2 with its own approval and reuses this file with `manifest: false`.
- A placeholder icon set (§3.2): a source SVG kept in the repository, plus PNGs rendered from it once and committed.
- iOS meta tags in `index.html` (§3.3).
- **Install hint** for iPhone Safari users: a small dismissible bar on Welcome and on the invite preview (§5.1). Decided 2026-10-11, option B.
- **Google sign-in inside the installed app**, tested first thing in Stage 2 (§3.5). If the popup fails, the redirect-mode fallback (§4) is built **in this feature**, after the spec is amended and approved again. Decided 2026-10-11, option A.
- The iPhone acceptance test on this branch's **preview deployment**, before merge (§3.4). Decided 2026-10-11, option A.
- A favicon (the same SVG); the site has none today.

**Out of scope**

- Service worker, precaching, offline fallback, the update prompt, and `vite-plugin-pwa` itself — all Step 6.2 (`pwa-offline.md`). This feature registers **no** service worker, and the build must not contain one.
- iOS splash screens (`apple-touch-startup-image`): dozens of exact device sizes for a placeholder identity. iOS shows a plain screen in `background_color` instead.
- The real logo and colours. The icon is a placeholder that the real identity replaces (§3.2).
- An Android/desktop install button (`beforeinstallprompt`). Those browsers offer installation in their own UI; the primary target is the iPhone.
- Routing a tapped link (an invite, a shared post) into the installed app. iOS has no web API for that; links open in Safari (`communities-invites.md` §8). Re-checked on the device (I9), not solved.
- Sharing the address with friends — still after Step 6.4 (`production-deploy.md` §0).
- Following the admin's accent colour in the icon or the manifest. Both are static files; the icon stays purple whatever the admin picks (`admin-panel.md`).

## 3. Data model changes

None. No schema change, no migration, and no backend change unless the fallback in §4 is needed.

### 3.1 Manifest (`frontend/public/manifest.webmanifest`)

Decided 2026-10-11, option A:

```json
{
  "id": "/",
  "name": "BookRough",
  "short_name": "BookRough",
  "description": "Share music with friends, on whatever app they use.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#fbfaf7",
  "background_color": "#fbfaf7",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- `start_url` `/`: Welcome already redirects a signed-in user to `/home` or `/onboarding`. The first launch is always signed out, because the installed app has its own cookie jar (`google-auth.md` §6).
- `display` `standalone` (CLAUDE.md §16). `fullscreen` would also hide the status bar.
- **No `orientation`**: iOS ignores it, and nothing in the layout breaks in landscape.
- **Colours**: `#fbfaf7` is the light `--canvas` token, as in `index.html`'s light `theme-color`. A manifest takes one value. The two media-specific `theme-color` meta tags already in `index.html` stay and override it where supported. A dark-mode launch therefore flashes the light background for a moment; accepted for a placeholder.
- Served from `dist/` at `/manifest.webmanifest`. Its path has a dot, so `vercel.json`'s SPA fallback leaves it alone (`production-deploy.md` §3.2).

### 3.2 Icons (placeholder)

The vinyl mark from `components/ui/Wordmark.tsx`, drawn in `--on-accent` white on a full-bleed `--accent` purple (`#534ab7`) square. No look-and-feel decision is asked here; the real logo replaces these files and nothing else.

| File (`frontend/public/`)     | Size   | Notes                                                                                |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `icons/icon.svg`              | vector | The source. Every PNG is rendered from it. Also the favicon (`<link rel="icon">`).   |
| `icons/icon-192.png`          | 192    | Manifest, `any`                                                                      |
| `icons/icon-512.png`          | 512    | Manifest, `any`                                                                      |
| `icons/icon-512-maskable.png` | 512    | Manifest, `maskable`: the mark inside the central 80% safe zone, purple to the edges |
| `apple-touch-icon.png`        | 180    | iPhone home screen. Opaque, no rounded corners: iOS applies its own mask             |

**How they are made.** Rendered once with the Chromium that `e2e/`'s Playwright already installs: a small committed script, `frontend/scripts/render-icons.mjs`, loads `icon.svg` at each size and saves a screenshot. It imports `chromium` from `e2e`'s existing `@playwright/test`, so it adds no dependency; it is run by hand when the SVG changes, never in CI or the build. The PNGs are committed.

### 3.3 iOS meta tags (`frontend/index.html`)

Added next to the existing viewport and `theme-color` tags:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="BookRough" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

- `status-bar-style` `default`: the page starts below the status bar, so no content sits under the clock in either colour scheme. `black-translucent` would draw the page under it. It is a visual choice, so it gets the simplest placeholder.
- `viewport-fit=cover` stays. The safe-area padding already in `index.css`, `BottomNav` and `Sheet` keeps content clear of the home indicator. Checked on the device (I4).
- `apple-mobile-web-app-capable` is the legacy switch older iOS versions still read; current iOS reads `display` from the manifest. Both are set.

### 3.4 Testing on a real iPhone before merge — what the developer sets up

Decided 2026-10-11, option A: the acceptance test runs on this branch's **preview deployment**, which uses the Neon `preview` database, so production data is never touched.

Two obstacles to remove, both dashboard settings (Claude never changes them):

1. **Vercel → project `bookrough` → Settings → Deployment Protection → Vercel Authentication: off.** Previews sit behind Standard Protection, and the installed app has its own cookie jar and opens `start_url` without a Shareable Link's query parameter. It would land on Vercel's login page instead of BookRough. Hobby has no password protection (Vercel docs, read 2026-10-11). While protection is off, every preview address is public but unshared — the same exposure production already has.
2. **Google Cloud Console → the Web client → Authorized JavaScript origins:** add the branch's stable alias `https://bookrough-git-feat-pwa-installable-<scope>.vercel.app` (the deployment's Domains list shows it). This is the same step as the 6.3 proof (`production-deploy.md` §3.4).

**After the merge**, both are reverted: protection back to Standard Protection with Vercel Authentication, and the alias removed from the JavaScript origins. If the fallback in §4 is built, its redirect URI on the alias is removed too, and the production one stays. Claude reminds the developer in the merge report. Step 6.2 decides in its own spec whether to reuse this setup.

### 3.5 Order of work in Stage 2

1. **The sign-in probe first.** Push the manifest, the meta tags and the icons. The developer installs from the preview and taps **Continue with Google** inside the installed app (I1–I3). This settles §4 before anything else is built.
2. If sign-in works: build the install hint (§5.1), then Stage 3.
3. If it fails: Claude amends this spec with the full redirect design (§4) and brings it to the developer for approval. It is built in this PR only after that approval.

## 4. API

**No endpoint changes** — unless the probe in §3.5 shows that Google's popup fails inside the installed app (the risk recorded in `google-auth.md` §8).

**Contingent fallback — outline only, specified in full only if needed:**

- `<GoogleLogin ux_mode="redirect" login_uri="<origin>/api/auth/google/redirect">`, either inside the installed app only (`navigator.standalone` / `display-mode: standalone`) or everywhere, decided in the amendment.
- **`POST /api/auth/google/redirect`** — public. Google POSTs a form (`credential`, `g_csrf_token`). The endpoint checks the `g_csrf_token` double-submit (form field against cookie), verifies the ID token through the same service as `POST /api/auth/google`, sets the same `token` cookie, and answers `303` to `/onboarding` or `/home`. On failure it answers `303` to `/?signin=failed`, which Welcome shows as its existing Google-side error.
- The OAuth client then also needs the endpoint's URL under **Authorized redirect URIs**, for production and for the preview alias. That is a developer step.
- Unknowns to settle on the device before the design is final: whether `g_csrf_token` arrives on Google's cross-site POST, and whether a cookie set on that response lands in the installed app's jar.
- If built: integration tests for every branch, `/security-review` (CLAUDE.md §15), `google-auth.md` updated, and `docs/auth.md` + `.docx` (the sign-in flow).

## 5. Screens & components

### 5.1 Install hint (`components/InstallHint.tsx`) — new

**Where:** at the top of **Welcome** (`pages/Welcome.tsx`) and of the **invite preview** (`pages/InvitePreview.tsx`) — the two screens a friend lands on in Safari.

**When it shows:** all three must hold.

- The device is **iOS**: `iPhone` / `iPod` in the user agent, or iPadOS's desktop-class agent (`Macintosh` plus `navigator.maxTouchPoints > 1`).
- The page is **not already installed**: `navigator.standalone !== true` and `matchMedia('(display-mode: standalone)')` does not match.
- The hint was **not dismissed** on this device.

On iOS the hint shows in any browser, since Chrome and Firefox on iOS also offer Add to Home Screen from their Share menu. It never shows on desktop or Android.

**Content (phone first, 375 px):** one slim bar of plain text, built like `AnnouncementBanner`:

> Install BookRough: tap **Share**, then **Add to Home Screen**.

plus a ✕ button (44×44 px, `aria-label="Dismiss install hint"`). It is placeholder styling from the existing tokens (`bg-accent-soft`, `text-accent-ink`), `role="note"`. The visual design comes later.

**Dismissal:** the ✕ hides it immediately and stores `bookrough.installHintDismissed = "1"` in `localStorage`, so it stays hidden on that device. If storage is unavailable or throws (private mode, blocked site data), the hint still shows, and the ✕ hides it for the current visit only — the same pattern as `AnnouncementBanner`.

**States:** no loading, empty or error states. The hint is synchronous and local, renders nothing when its conditions fail, and never blocks or shifts the Google button.

**Logic placement:** detection lives in `lib/installHint.ts` (`shouldOfferInstall(navigator, matchMedia)`), so it can be unit-tested without a component. The component reads it once on mount.

### 5.2 `index.html`

Changes as in §3.3. No visible change on desktop beyond the favicon.

### 5.3 Inside the installed app — no code change, checked on the device

- Every screen shows without an address bar. Navigation happens inside the app, because every route is in `scope` `/`.
- External links (Spotify, Apple Music and the other service links on a post) leave the app and open the music app or Safari. That is expected iOS behaviour for out-of-scope links.
- Loading, error and offline states stay as they are. With no connection the installed app shows iOS's own error page until Step 6.2 adds the offline fallback; accepted for this feature.

## 6. Edge cases & failure modes

- **Separate cookie jar.** Signing in once in Safari does not sign the user in inside the installed app; they sign in once more there (`google-auth.md` §6). This is expected. The 30-day sliding session keeps it rare.
- **Google popup fails in standalone** → §3.5 step 3 and §4. Known before any other work is built.
- **Invite link tapped by someone who has the app installed** → it opens in Safari (I9). Joining there works, and the community appears in the installed app on its next load, because membership is server-side (`communities-invites.md` §8).
- **The hint after installing.** The installed app never shows it (standalone check). Safari may still show it to someone who installed but did not dismiss it, since Safari cannot see whether the app is installed. They tap ✕ once.
- **iPad.** Its desktop-class user agent is caught by the touch-points check. Desktop Safari on a Mac has no touch points, so no hint there.
- **`localStorage` throws** → the hint shows and dismisses for this visit (§5.1).
- **Wrong MIME type for the manifest.** Vercel is expected to serve `.webmanifest` as `application/manifest+json`. Checked as I10; Safari and Chrome also accept `application/json`.
- **A stale `index.html` cached by Safari** after deploy could miss the manifest link until a reload. There is no service worker yet, so a reload always fetches the new file.
- **The admin changes the accent colour** → the app's accent follows; the icon and splash colour do not (§2). Accepted.
- **Accidentally shipping a service worker.** The build must contain no `sw.js` or `registerSW`. A unit test asserts that `index.html` and `main.tsx` register none (§7).
- **Preview protection left off after merge** → previews stay public. Reverting it is part of the merge report (§3.4).

## 7. Test scenarios

**Unit — frontend (Vitest)**

`lib/installHint.ts`:

- ✅ iPhone Safari user agent, not standalone → offer.
- ✅ iPad (desktop-class agent with `maxTouchPoints` 5) → offer.
- ✅ Chrome on iOS (`CriOS`) → offer.
- ❌ `navigator.standalone === true` → no offer.
- ❌ `display-mode: standalone` matches → no offer.
- ❌ Desktop Safari on a Mac (`Macintosh`, `maxTouchPoints` 0) → no offer.
- ❌ Android Chrome → no offer.
- ❌ Desktop Chrome on Windows → no offer.

Manifest contract (`manifest.test.ts`, reads the file with a `?raw` import, no `node:fs`):

- ✅ `name` and `short_name` are `BookRough`; `start_url`, `scope` and `id` are `/`; `display` is `standalone`.
- ✅ `theme_color` and `background_color` equal the light `--canvas` value in `index.css`.
- ✅ The icons list a 192 and a 512 `any` icon and a 512 `maskable` icon.
- ✅ Every icon in the manifest exists under `public/` (`import.meta.glob`), and its PNG header's width and height match its declared `sizes`.
- ❌ No `orientation` key.

`index.html` contract (`?raw` import):

- ✅ It links the manifest, the SVG favicon and `apple-touch-icon.png` (the file exists and is 180×180).
- ✅ It has `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` = `BookRough`, `apple-mobile-web-app-status-bar-style` = `default`, and the viewport keeps `viewport-fit=cover`.
- ❌ Neither `index.html` nor `src/main.tsx` registers a service worker (`serviceWorker.register`, `registerSW`) — Step 6.2's job.

`vercel.json` contract (extends `vercelConfig.test.ts`):

- ✅ `/manifest.webmanifest`, `/apple-touch-icon.png` and `/icons/icon-192.png` route to `web` and are **not** rewritten to `/index.html`.

**Component (Vitest + RTL)**

`InstallHint`:

- ✅ Renders the instruction and the dismiss button when the offer conditions hold.
- ✅ ✕ hides it and stores the dismissal; a fresh render stays hidden.
- ❌ Renders nothing when already dismissed.
- ❌ Renders nothing when the offer conditions fail (standalone).
- ❌ `localStorage.getItem` throws → still renders; `setItem` throws → ✕ still hides it for this render.

Pages:

- ✅ `Welcome` shows the hint on an iPhone user agent; ❌ it does not on a desktop one.
- ✅ `InvitePreview` shows the hint on an iPhone user agent.

**Integration (Supertest)** — none, unless §4 is built. In that case: `303` success to `/onboarding` and `/home`, a `g_csrf_token` mismatch or a missing one, an invalid or expired credential, the wrong audience, and the Google keys unreachable, each specified in the amendment.

**E2E (Playwright)** — none new. Playwright cannot install a PWA or emulate iOS standalone mode, and the contracts above prove the files. The existing 41 runs (+3 skipped) stay green.

**Local check (Claude, before the preview)** — `npm run build && npm run preview`. Chrome DevTools → Application → Manifest shows no errors and every icon. `dist/` contains no `sw.js`.

**Manual — on a real iPhone, on this branch's preview (the developer, §3.4)**

- I1. In Safari, open the preview → the install hint shows on Welcome.
- I2. Share → Add to Home Screen → the icon is the purple vinyl mark and the name under it is **BookRough**.
- I3. Launch from the icon → no address bar. **Continue with Google** signs in inside the installed app, and onboarding follows. _(This is the probe from §3.5; if it fails, stop and go to §4.)_
- I4. The status bar is readable in light and dark mode. The bottom navigation sits above the home indicator; nothing is hidden under the notch.
- I5. The golden loop inside the installed app: create a community, post a Spotify link (it converts), rate the post.
- I6. Navigating between screens stays inside the app. A post's music-service link opens the music app or Safari.
- I7. Close the app fully and relaunch → still signed in, on `/home`.
- I8. Inside the installed app the hint never shows. In Safari, ✕ hides it, and it stays hidden after a reload.
- I9. Tap an invite link from Messages while the app is installed → it opens in Safari (expected); after joining there, the community appears in the installed app on its next load.
- I10. Desktop Chrome on the preview: DevTools → Application → Manifest is valid, and the manifest's response is `application/manifest+json`.

## 8. Open questions

None at approval. One question is decided by the device in Stage 2, not by the developer now: whether the popup works in the installed app (§3.5). If it does not, the redirect design in §4 comes back for approval before it is built.

## 9. Decisions log

| Date       | Decision                                                                                                                                                                                              | Reason                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | The iPhone acceptance test runs on this branch's preview before merge, with Vercel Authentication off and the preview alias in the OAuth JavaScript origins; both reverted after the merge (option A) | The only option where the step's real test runs before merge. A Shareable Link's query parameter does not reach the installed app's `start_url`, and Hobby has no password protection |
| 2026-10-11 | Test Google's popup in the installed app first; if it fails, the redirect fallback is built in this feature after a spec amendment (option A)                                                         | An installed app nobody can sign into does not meet the goal. Designing the fallback only if the device proves it necessary avoids designing the wrong thing                          |
| 2026-10-11 | Manifest: `BookRough` / `BookRough`, `start_url` = `scope` = `id` = `/`, `standalone`, no `orientation` (option A)                                                                                    | Welcome already routes a signed-in user; the first launch is always signed out; iOS ignores orientation                                                                               |
| 2026-10-11 | No new dependency in 6.1: a hand-written manifest and PNGs rendered once with the existing Playwright Chromium; `vite-plugin-pwa` moves to 6.2 (option A)                                             | No service worker is needed to install. The plugin would build an unregistered `sw.js` early (CLAUDE.md §16's warning). 6.2 can reuse the file with `manifest: false`                 |
| 2026-10-11 | A dismissible install hint on Welcome and the invite preview, iOS only, hidden inside the installed app (option B)                                                                                    | iOS has no install prompt, and invite links always open in Safari, which is where friends land                                                                                        |
| 2026-10-11 | Placeholders without a question: the vinyl mark on the accent purple, `#fbfaf7` colours, `status-bar-style: default`, no splash screens                                                               | Visual design is deferred (developer's standing preference); the simplest options that reuse existing tokens                                                                          |

## 10. Doc updates (same PR)

- `docs/deployment.md` + `.docx` §6.1: the manifest is a static file and no service worker exists until 6.2; testing on a preview needs Vercel Authentication off and the alias in the OAuth origins (§3.4).
- `docs/frontend screens.md` + `.docx`: Welcome (1.1) and Join Community gain the iOS install hint.
- `docs/tech stack.md` + `.docx`: the `vite-plugin-pwa` entry says it arrives in Step 6.2. No new entry is needed (CLAUDE.md §18): the icon script uses the Playwright already recorded.
- `docs/features/google-auth.md` §8: the popup risk resolved — either "works" or "fallback built", with the date.
- `docs/features/communities-invites.md` §8: "Re-check in Phase 6" answered by I9.
- `DEVELOPMENT.md`: Step 6.1 filled per §13, with its `vite-plugin-pwa` task moved to Step 6.2.
- If §4 is built: `docs/auth.md` + `.docx` (the sign-in flow) and `docs/use cases.md` + `.docx` if UC-1/UC-2's flow text changes.
