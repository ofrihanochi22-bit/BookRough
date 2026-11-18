# Feature: Onboarding tutorial (N4)

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use cases** | No new UC. UC-1 (a walkthrough after Complete Your Profile); UC-12 and UC-13 (two tips along the rating loop)                                                                |
| **Phase**     | 6 — Step 6.1q of `DEVELOPMENT.md`, manual-test note N4 (`docs/manual-tests/2026-11-04.md`), after the redesign; amended by Step 6.1y (improvement round point 6)             |
| **Branch**    | `feat/onboarding-tutorial`; the amendment on `feat/illustrated-guide`                                                                                                        |
| **Status**    | ☑ Spec approved (2026-11-10) · ☑ Merged (PR #61). Amendment, the illustrated guide: ☑ Spec approved (2026-11-16) · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged (PR #71) |

---

## 1. Goal

A new user — and, once, every existing user — is shown how BookRough works: a short guide of six illustrated slides when they first reach the app, each picturing the screen and the control to use, and two small tips in place along the rating loop, where the manual test got stuck (a community post is rated only from My List, after saving it). Each is shown once per account, on every device, and the guide can be replayed from My Profile. An environment switch turns all of it off for testing.

> **Amended 2026-11-16 (improvement round point 6, Step 6.1y).** The first version's five text-only cards described the site without showing it. They are replaced by six slides, each with a simplified phone screen drawn in code with the design system and the control to use ringed (§5.1). Everyone who closed the old cards sees the new guide once (§3). The tips, the flags' API and `TUTORIAL_ENABLED` are unchanged.

## 2. Scope

**In scope**

- **Walkthrough (the guide):** six full-screen illustrated slides over the tab screens, shown once per account after Complete Your Profile (§5.1). Each slide pictures a simplified screen drawn in code (no image files), adapted to the user's accent colour and light/dark mode, their own streaming service and avatar, reduced motion, and touch or mouse wording.
- **Reset once for the guide:** a data-only migration clears `walkthrough_seen_at` for every user, so people who closed the old cards see the new guide once (§3).
- **"Reopen from Profile" hint** on the last slide, and as a short toast when the guide is skipped before the last slide.
- **Two tips** (§5.2): the _save tip_ in a community feed, by the save button; the _list tip_ on My List, by Rate & Review.
- **Seen state on the account:** three nullable timestamp columns on `users`; the session tells the client what is still to show.
- **Existing users see it too:** the columns start null for everyone (developer, 2026-11-10).
- **Replay** of the five cards from My Profile; the tips do not come back.
- **`TUTORIAL_ENABLED`** backend environment variable: unset = on; `false` = nothing is shown in that environment. Set to `false` in local E2E and CI E2E.
- Amendment doc updates (2026-11-16): `use cases` UC-1 and `frontend screens` (`.md` + `.docx` each: "five cards" becomes six illustrated slides), `DEVELOPMENT.md` Step 6.1y. `tables` is unchanged (no schema change).
- Doc updates: `tables` (`.md` + `.docx`), `use cases` UC-1 (`.md` + `.docx`, one added step), `frontend screens` (`.md` + `.docx`, the walkthrough overlay and the Profile row), `deployment` (`.md` + `.docx`, the variable), `.env.example`, CLAUDE.md §6 (the columns), `DEVELOPMENT.md` Step 6.1q; Step 6.1p's status line flipped to ✅ Done (merged as PR #60).

**Out of scope**

- Tips on any other screen (Share, Friends, Notifications, Recommendations). Decided 2026-11-10: the rating loop only.
- Replaying the tips, or resetting any seen state through the UI or an API.
- A per-account "skip tutorial" flag (option rejected 2026-11-10: a fresh test account reaches the walkthrough before a column could be set).
- Interactive coach marks over the real UI (a new user has no communities, posts or friends for them to point at — decided 2026-11-16), screenshots or other image files (they go stale with every redesign, ignore the accent and dark mode, and weigh on the PWA precache), videos, and any tour library (no new dependency).
- Slides about comments and threads, global search, community settings, or the profile — found from the screens themselves (decided 2026-11-16).
- A separate desktop layout of the pictured screens: the app has none, so the phone drawing is right on a computer too.
- A per-user guide version column (option rejected 2026-11-16: a one-time reset does the job for a need that may not recur).
- Analytics on who skipped or finished.
- The PWA icon redraw from the logo — a separate feature.
- i18n / RTL (CLAUDE.md §8).

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_tutorial_seen`

```prisma
model User {
  // …existing columns…
  /// When the walkthrough was finished or skipped; null = still to show.
  /// Never sent to a client as a date — only as `tutorial` flags (§4).
  walkthroughSeenAt DateTime? @map("walkthrough_seen_at") @db.Timestamptz(3)
  /// When the save tip (community feed) was dismissed or acted on.
  saveTipSeenAt     DateTime? @map("save_tip_seen_at") @db.Timestamptz(3)
  /// When the list tip (My List) was dismissed or acted on.
  listTipSeenAt     DateTime? @map("list_tip_seen_at") @db.Timestamptz(3)
}
```

No backfill: every existing row starts null, so existing users see the walkthrough once (§2). No index (read only with the caller's own row).

### 3.1 Amendment: reset for the illustrated guide (2026-11-16)

Migration: `npx prisma migrate dev --create-only --name reset_walkthrough_for_guide`, then hand-written — data only, no schema change, so `schema.prisma` and `docs/tables.md` are untouched:

```sql
-- The illustrated guide replaces the five text cards: everyone sees it once.
UPDATE "users" SET "walkthrough_seen_at" = NULL WHERE "walkthrough_seen_at" IS NOT NULL;
```

`save_tip_seen_at` and `list_tip_seen_at` are **not** reset: the tips did not change. The migration runs once per database (Prisma records it), so the guide is never reset again by a redeploy.

## 4. API

### Session payload (changed): `GET /api/auth/me`, `POST /api/auth/google`, `PATCH /api/users/me`

`sessionPayload` gains one field, the caller's own state only:

```ts
tutorial: {
  walkthrough: boolean;
  saveTip: boolean;
  listTip: boolean;
} // true = still to show
```

Each flag is `TUTORIAL_ENABLED && column === null`. A user who still needs onboarding gets all three `false` (the walkthrough follows the profile, never precedes it). `toPublicUser` is **unchanged** — another user's tutorial state never leaves the server.

### `PATCH /api/users/me/tutorial`

- **Auth:** required.
- **Request:** `{ seen: "walkthrough" | "saveTip" | "listTip" }`, Zod `.strict()`.
- **Behaviour:** sets that column to `now()` **only if it is null** (idempotent: a second call keeps the first time). Works whatever `TUTORIAL_ENABLED` is, so state recorded during a test stays truthful.
- **Success:** `200` `{ tutorial: { walkthrough, saveTip, listTip } }`.
- **Errors:**
  - `400` body is not JSON.
  - `422` missing or unknown `seen`; extra key.
  - `401` not signed in.
  - (No `403`/`404`: it acts only on the caller's own row.)

### `TUTORIAL_ENABLED` (backend env, `config/env.ts`)

Optional. Case and spaces forgiven; only `false` switches the tutorial off, anything else (or unset) is on — so a typo at a dashboard cannot hide it silently the wrong way round, matching `RATE_LIMITS_DISABLED`'s forgiving parse. Allowed in every `NODE_ENV` (it hides help, it opens nothing). Production leaves it unset.

## 5. Screens & components

Visual treatment: the simplest that fits Mixtape (developer, defer visual design) — kit `Sheet`/card surfaces, display-face headings, the accent primary button, a small cassette illustration from the existing kit. Placeholders, replaceable.

### 5.1 Walkthrough (`components/Walkthrough.tsx`), new

- **When:** rendered by `TabLayout` when `session.tutorial.walkthrough` is true — so the first tab screen reached after onboarding (normally Home) has it on top. A user sent to an invite after onboarding (`pendingInvite`) sees it when they first reach a tab screen.
- **Layout (375px first):** a full-screen `role="dialog"` `aria-modal` overlay on `canvas`. Top right "Skip". Centre: the **picture** (below), then the heading and one to three lines. Bottom: six progress dots (the current one marked; "Step N of 6" for screen readers), "Back" (from slide 2) and "Next"; on slide 6 "Next" becomes **"Get started"**, with the reopen hint above the buttons. Swipe left/right (touch and pen) and arrow keys move between slides. Focus is trapped in the dialog and moves to each slide's heading; Escape = Skip. Every control ≥ 44×44px.
- **The picture** (`components/guide/`): a simplified phone screen drawn in JSX with the Mixtape tokens (`canvas`, `surface`, `ink`, `muted`, `line`, `accent`, the kit's `Avatar`, `CommunityCover` and `BookmarkIcon`) — **no image files**, so it adds no PWA precache weight and follows every later token change. It is the whole screen in miniature (the top of the screen, a few rows, the bottom bar), not a close-up, so the user learns where the control sits. The control to use is **ringed in the accent colour**; the ring pulses gently, and does not pulse under `prefers-reduced-motion` (Tailwind `motion-safe:`). Placeholder rows are plain bars, not text. The picture is `role="img"` with an `aria-label` describing it (per slide, below); everything inside it is `aria-hidden`. It scales to the height left on the screen (it must fit with the copy and buttons at 375×667) and is capped at about 260px wide on wider screens. The final look is shown to the developer as a screenshot at 375px and approved before the PR (redesign co-design rule).
- **Adapted to the user** (all read on the client; nothing new from the server):
  - _Accent and light/dark_ — automatic, through the CSS variables (`data-accent`, `prefers-color-scheme`).
  - _Their streaming service_ — slide 1 names `user.preferredService` as "your" service and Spotify as the friend's; if theirs is Spotify, the friend's is Apple Music. Unset (not reachable after onboarding) → as if Apple Music.
  - _Their avatar_ — the kit's `Avatar` with the user's id, name and picture stands for "you" in slides 1 and 6.
  - _Touch or mouse_ — `matchMedia('(pointer: coarse)')`: "Tap"/"tap" on touch, "Click"/"click" otherwise; slide 1's hint reads "Swipe to move between slides." on touch and "Use the arrow keys to move between slides." otherwise. Read once when the guide opens.
- **Slides** (final copy, English, no em dash; `{Tap}` is the touch/mouse word, `{yours}` and `{theirs}` the service names):
  1. **Songs that travel** — "A friend shares a song from {theirs}. You get it on {yours}, the service in your profile. Converting a link takes a few seconds." Picture: a post card from a friend (avatar, cover, two bars), with a row of two service chips, {yours} ringed. Label: "A post from a friend, with a button to open it on {yours} marked."
  2. **Join or start a community** — "Communities are your friend groups. {Tap} Create community on Home to start one. Got an invite link? Open it to join." Picture: Home with two community rows (generated covers) and the dashed Create tile, ringed. Label: "The Home screen, with the Create community tile marked."
  3. **Share a song** — "{Tap} Share in the middle of the bar. Pick a community or a friend, then paste a link from any service." Picture: Home with the bottom bar, the Share button ringed. Label: "The Home screen, with the Share button in the middle of the bottom bar marked."
  4. **Save it for later** — "In a community, {tap} the bookmark on a post. The song goes to My List." Picture: a community feed with two post cards, the first card's bookmark ringed. Label: "A community feed, with the bookmark on a post marked."
  5. **Rate what you heard** — "Once you've listened, open My List and {tap} Rate & Review. Score it 1 to 10. A song a friend sends you is rated right from Recommendations." Picture: My List with a saved card whose Rate & Review button is ringed, and the ten-star row under it. Label: "My List, with the Rate and Review button on a saved song marked."
  6. **Friends and the bell** — "Add friends on the Friends tab, then send a song straight to one. The bell on Home shows new posts, ratings, replies and invitations." Picture: Home with the bell in the header and the Friends tab in the bottom bar, both ringed. Label: "The Home screen, with the bell and the Friends tab marked."
- **Reopen hint:** on slide 6, a muted line above the buttons: "You can open this guide again from Profile." When the guide is closed by Skip or Escape **before** slide 6, in `first` mode only, the same sentence is shown as a toast (`react-hot-toast`, the app's toaster, ~4 s). Not after "Get started" (the user just read it), and never in replay mode.
- **Closing** (Skip, Escape or Get started): the overlay closes at once, the store marks `walkthrough` seen, and `PATCH /users/me/tutorial {seen:"walkthrough"}` is sent in the background. Failure (network, offline) is silent — no error toast; the walkthrough simply returns next session. The interceptor's toast is suppressed for this call.
- **Replay** (`mode="replay"`): same slides, sends nothing on close, no reopen toast.
- Loading / empty / error states: none — static content, no request before display. A broken avatar picture falls back to initials (the kit's `Avatar` already does).

### 5.2 Tips (`components/Tip.tsx`), new

A small note on `tape` paper (as the comment note), text + a "Got it" button (≥ 44px), `role="note"`. Shown once per account; dismissed by "Got it" **or** by doing the thing it explains. Either way: the store flag goes false at once and `PATCH /users/me/tutorial` is sent in the background, silent on failure. Never shown while the walkthrough is open.

- **Save tip** — Community Feed: above the **first post card that shows a bookmark** (not your own post, not one you rated), when `tutorial.saveTip`. Copy: "Save a song to listen later. You'll rate it from My List." Acted on = a successful save of any post on that screen.
- **List tip** — My List: above the **first saved card that has Rate & Review**, when `tutorial.listTip`. Copy: "Listened? Rate it here. Your score shows on the post." Acted on = a submitted rating from My List.
- No eligible card on the screen (no posts, all your own, empty My List) → no tip; it waits for a later visit.

### 5.3 My Profile — "How BookRough works" row

A `surface` row (as the Admin row) above Sign out: icon, "How BookRough works", chevron. Opens the walkthrough in replay mode. Shown even when `TUTORIAL_ENABLED=false` (replay is user-initiated).

### 5.4 Store

`stores/auth.ts`: `Session` and the store gain `tutorial`; a `markTutorialSeen(item)` action flips the flag locally. `api/users.ts` gains `markTutorialSeen(item)`.

## 6. Edge cases & failure modes

- **Offline or the PATCH fails:** the walkthrough/tip closes for this session; the server still has null, so it returns on the next launch. Accepted — better than a toast over help text.
- **Two devices at once:** both may show the walkthrough; the first close sets the time, the second is a no-op (null-only update).
- **Closed mid-walkthrough** (app killed): nothing was recorded; it shows again. Intended.
- **Onboarding not finished:** all flags false, so the onboarding screen is never covered. The PATCH is accepted anyway (harmless).
- **Signed out on another tab / 401:** the interceptor's usual handling; nothing tutorial-specific.
- **`TUTORIAL_ENABLED=false`:** flags all false; the PATCH still records; the Profile replay still works.
- **Feed has only your own posts or posts you rated:** no save tip yet.
- **Saved item can't be rated** (left the community / no longer friends): it is skipped when choosing where the list tip goes.
- **Reduced motion:** slides change without any animation; the ring's pulse is the guide's only motion and is off under `prefers-reduced-motion` (the ring itself stays).
- **Short screens** (375×667, landscape phone): the picture shrinks first; copy and buttons never scroll off. A very short viewport (landscape) may hide the picture rather than squeeze the copy.
- **Existing users after the reset (§3.1):** they see the guide on their next visit to a tab screen; tips they already dismissed stay dismissed.
- **The guide open when the session refreshes** (`/auth/me` behind a cached snapshot): the store's closed-since-sign-in list already keeps a closed guide closed; an open one stays open.
- **Mouse user on a touch laptop:** `pointer: coarse` decides the words; either word is understandable, so a mismatch is cosmetic.

## 7. Test scenarios

**Unit (backend)**

- ✅ `env`: unset → enabled; `false` / `FALSE` → disabled; `true`, `no`, `` → enabled.
- ✅ `sessionPayload`: new user after onboarding → all three true; ❌ still onboarding → all false; ❌ disabled → all false; partly seen → only the unseen true.
- ✅ `markTutorialSeen`: sets a null column; ✅ second call keeps the first timestamp; ❌ a database failure is passed on. (An unknown item is refused by the controller's Zod enum, tested in integration.)
- ✅ `toPublicUser` still has exactly its five fields (no tutorial leak).

**Integration (Supertest)**

- ✅ `GET /auth/me` for an onboarded user → `tutorial` all true; after `PATCH /users/me/tutorial {seen:"walkthrough"}` → `walkthrough: false`, others true.
- ✅ `PATCH` twice → `200` both times, timestamp unchanged.
- ✅ With the tutorial disabled (env override in the test) → `/auth/me` flags all false; the PATCH still `200`.
- ❌ `400` malformed JSON; `422` empty body, unknown `seen`, extra key; `401` no cookie.
- ✅ Another user's profile (`GET /users/:id`) carries no tutorial field.
- ✅ The reset migration (§3.1): applied by the integration suite's `migrate reset` like every migration; one test runs its SQL against seeded users — a user with `walkthrough_seen_at` set comes back null, both tip columns keep their times, and `/auth/me` then says `walkthrough: true`. ❌ A user still onboarding stays all-false after the reset.

**Component (Vitest + RTL)**

- ✅ Walkthrough renders slide 1 with its picture (`role="img"` + label), Next/Back move through all six, "Step N of 6" reflects position, slide 6 shows "Get started" and the reopen hint.
- ✅ Each slide's picture has its own accessible label, and the ringed control is marked in it (a `data-ring` element per slide; two on slide 6).
- ✅ Slide 1 names the user's service as "yours" and Spotify as the friend's; ✅ a Spotify user's friend is on Apple Music; ❌ no preferred service → Apple Music as yours.
- ✅ Slide 1 shows the user's own avatar (initials when there is no picture).
- ✅ `pointer: coarse` → "Tap" and the swipe hint; ✅ otherwise "Click" and the arrow-keys hint.
- ✅ The ring pulses only through `motion-safe:` (class assertion; jsdom cannot evaluate the media query).
- ✅ Skip, Escape and Get started each close it, mark the store, call the API once; ✅ replay mode calls nothing.
- ✅ Skip or Escape before slide 6 in `first` mode → the reopen toast; ❌ no toast after Get started; ❌ no toast in replay mode; ❌ no toast on Skip from slide 6.
- ❌ The API call rejects → it still closes, no error toast.
- ✅ Arrow keys move slides; focus moves to each slide's heading; Tab stays inside the dialog.
- ✅ No `<img>` with a file source inside the guide's pictures (drawn, not loaded) — the only `<img>` allowed is the user's own avatar.
- ✅ TabLayout shows the walkthrough only when `tutorial.walkthrough`.
- ✅ Save tip: shown above the first bookmarkable card; not above own/rated posts; ❌ hidden when `saveTip` false; "Got it" dismisses and calls the API; a successful save dismisses it.
- ✅ List tip: above the first rateable saved card; ❌ hidden when no rateable card or `listTip` false; "Got it" and a submitted rating dismiss it.
- ✅ Profile: the "How BookRough works" row opens the walkthrough in replay mode.

**E2E** — none new: not a golden loop. `TUTORIAL_ENABLED=false` in `e2e/playwright.config.ts`'s backend env and `main.yml`, so the existing loops are unaffected.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                  | Reason                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-10 | Form: a five-card walkthrough **and** in-place tips                                                       | Developer chose "both": one overview, plus help at the exact step where people got stuck                                                         |
| 2026-11-10 | Tips: only the save tip (feed) and the list tip (My List)                                                 | The two steps of the rating loop the manual test missed; Share is already prominent and in the walkthrough                                       |
| 2026-11-10 | Seen state on the account (three timestamp columns), not `localStorage`                                   | iOS gives the installed PWA storage apart from Safari; per-device state would repeat it on install                                               |
| 2026-11-10 | Existing users see it once too; no backfill                                                               | Small group; the N4 evidence came from an existing user                                                                                          |
| 2026-11-10 | `TUTORIAL_ENABLED` env (environment-wide off switch), not a per-account flag                              | Developer: for testing; a fresh test account would see the walkthrough before a column could be set                                              |
| 2026-11-10 | Five cards as listed in §5.1                                                                              | Developer approved the list                                                                                                                      |
| 2026-11-10 | Replay from My Profile shows the cards only; tips never return                                            | Card 4 explains the same thing as the tips                                                                                                       |
| 2026-11-10 | Own endpoint `PATCH /users/me/tutorial` instead of a key on `PATCH /users/me`                             | `PATCH /users/me` carries the profile's onboarding rules and avatar side effects; seen state is unrelated                                        |
| 2026-11-10 | Marking seen is fire-and-forget; failure silent                                                           | A toast about help text is noise; the cost of failure is seeing it once more                                                                     |
| 2026-11-10 | The store keeps items closed since sign-in hidden, whatever a later session says                          | `/code-review`: a profile save after a failed background PATCH brought the walkthrough back mid-session                                          |
| 2026-11-10 | Swipe on touch and pen only; no animation between cards                                                   | `/code-review`: a mouse drag (text selection) turned the card; motion stays reserved for the reels                                               |
| 2026-11-16 | Form: illustrated slides, then the existing tips (not coach marks, not screenshots)                       | Improvement round point 6: the cards described the site without showing it; a new user's screens are empty for coach marks; screenshots go stale |
| 2026-11-16 | Six slides: songs that travel, join or start a community, share, save, rate, friends and the bell         | Developer approved the list and order; comments, search and settings are found from the screens                                                  |
| 2026-11-16 | Each picture is the whole phone screen in miniature, control ringed                                       | Developer chose it over a close-up: the user learns where the control sits                                                                       |
| 2026-11-16 | Pictures adapt: tokens (automatic), the user's service and avatar, reduced motion, touch or mouse wording | Developer asked whether slides can follow device, design settings and preferences; all cheap when drawn in code                                  |
| 2026-11-16 | Keep Skip, dots and the Profile replay; add a "reopen from Profile" hint and a toast on an early Skip     | Developer: so someone who skips knows where to find it                                                                                           |
| 2026-11-16 | Reset `walkthrough_seen_at` for everyone once, by a data-only migration; tips not reset                   | Developer chose it over a version column (B) and new-users-only (C): small group, the request came from an existing user                         |
