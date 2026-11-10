# Feature: Onboarding tutorial (N4)

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| **Use cases** | No new UC. UC-1 (a walkthrough after Complete Your Profile); UC-12 and UC-13 (two tips along the rating loop)  |
| **Phase**     | 6 — Step 6.1q of `DEVELOPMENT.md`, manual-test note N4 (`docs/manual-tests/2026-11-04.md`), after the redesign |
| **Branch**    | `feat/onboarding-tutorial`                                                                                     |
| **Status**    | ☑ Spec approved (2026-11-10) · ☑ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                                |

---

## 1. Goal

A new user — and, once, every existing user — is shown how BookRough works: a short walkthrough of five cards when they first reach the app, and two small tips in place along the rating loop, where the manual test got stuck (a community post is rated only from My List, after saving it). Each is shown once per account, on every device, and the walkthrough can be replayed from My Profile. An environment switch turns all of it off for testing.

## 2. Scope

**In scope**

- **Walkthrough:** five full-screen cards over the tab screens, shown once per account after Complete Your Profile (§5.1).
- **Two tips** (§5.2): the _save tip_ in a community feed, by the save button; the _list tip_ on My List, by Rate & Review.
- **Seen state on the account:** three nullable timestamp columns on `users`; the session tells the client what is still to show.
- **Existing users see it too:** the columns start null for everyone (developer, 2026-11-10).
- **Replay** of the five cards from My Profile; the tips do not come back.
- **`TUTORIAL_ENABLED`** backend environment variable: unset = on; `false` = nothing is shown in that environment. Set to `false` in local E2E and CI E2E.
- Doc updates: `tables` (`.md` + `.docx`), `use cases` UC-1 (`.md` + `.docx`, one added step), `frontend screens` (`.md` + `.docx`, the walkthrough overlay and the Profile row), `deployment` (`.md` + `.docx`, the variable), `.env.example`, CLAUDE.md §6 (the columns), `DEVELOPMENT.md` Step 6.1q; Step 6.1p's status line flipped to ✅ Done (merged as PR #60).

**Out of scope**

- Tips on any other screen (Share, Friends, Notifications, Recommendations). Decided 2026-11-10: the rating loop only.
- Replaying the tips, or resetting any seen state through the UI or an API.
- A per-account "skip tutorial" flag (option rejected 2026-11-10: a fresh test account reaches the walkthrough before a column could be set).
- Interactive coach marks that highlight real controls, step-by-step tours, videos or animations beyond the kit's existing motion.
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
- **Layout (375px first):** a full-screen `role="dialog"` `aria-modal` overlay on `canvas`. Top right "Skip". Centre: heading + one or two lines. Bottom: five progress dots (current marked, `aria-current="step"`), "Back" (from card 2) and "Next"; on card 5 "Next" becomes **"Get started"**. Swipe left/right and arrow keys move between cards. Focus is trapped in the dialog and starts on the heading; Escape = Skip.
- **Cards** (final copy, English):
  1. **Welcome to BookRough** — Share music with your friends, whatever service each of you listens on.
  2. **Share a song** — Tap Share in the middle of the bar. Send a song to a community or straight to a friend — paste a link from any service.
  3. **Links that travel** — Each friend gets the song on their own service, the one in their profile. Converting a link takes a few seconds.
  4. **Save, listen, rate** — Save a community post with the bookmark and it goes to My List. Once you've listened, rate it there, 1 to 10. A song a friend sends you can be rated right from Recommendations.
  5. **Friends and notifications** — Add friends on the Friends tab — search finds anyone. The bell on Home shows new posts, ratings, replies and invitations.
- **Closing** (Skip, Escape or Get started): the overlay closes at once, the store marks `walkthrough` seen, and `PATCH /users/me/tutorial {seen:"walkthrough"}` is sent in the background. Failure (network, offline) is silent — no toast; the walkthrough simply returns next session. The interceptor's toast is suppressed for this call.
- **Replay** (`mode="replay"`): same cards, sends nothing on close.
- Loading / empty / error states: none — static content, no request before display.

### 5.2 Tips (`components/Tip.tsx`), new

A small note on `tape` paper (as the comment note), text + a "Got it" button (≥ 44px), `role="note"`. Shown once per account; dismissed by "Got it" **or** by doing the thing it explains. Either way: the store flag goes false at once and `PATCH /users/me/tutorial` is sent in the background, silent on failure. Never shown while the walkthrough is open.

- **Save tip** — Community Feed: above the **first post card that shows a bookmark** (not your own post, not one you rated), when `tutorial.saveTip`. Copy: "Save a song to listen later — you'll rate it from My List." Acted on = a successful save of any post on that screen.
- **List tip** — My List: above the **first saved card that has Rate & Review**, when `tutorial.listTip`. Copy: "Listened? Rate it here — your score shows on the post." Acted on = a submitted rating from My List.
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
- **Reduced motion:** nothing to reduce — cards change without any animation (motion stays reserved for the reels, ui-redesign.md §3.7).

## 7. Test scenarios

**Unit (backend)**

- ✅ `env`: unset → enabled; `false` / `FALSE` → disabled; `true`, `no`, `` → enabled.
- ✅ `sessionPayload`: new user after onboarding → all three true; ❌ still onboarding → all false; ❌ disabled → all false; partly seen → only the unseen true.
- ✅ `markTutorialSeen`: sets a null column; ✅ second call keeps the first timestamp; ❌ unknown item rejected (`AppError 422` from the service guard, if reached).
- ✅ `toPublicUser` still has exactly its five fields (no tutorial leak).

**Integration (Supertest)**

- ✅ `GET /auth/me` for an onboarded user → `tutorial` all true; after `PATCH /users/me/tutorial {seen:"walkthrough"}` → `walkthrough: false`, others true.
- ✅ `PATCH` twice → `200` both times, timestamp unchanged.
- ✅ With the tutorial disabled (env override in the test) → `/auth/me` flags all false; the PATCH still `200`.
- ❌ `400` malformed JSON; `422` empty body, unknown `seen`, extra key; `401` no cookie.
- ✅ Another user's profile (`GET /users/:id`) carries no tutorial field.

**Component (Vitest + RTL)**

- ✅ Walkthrough renders card 1, Next/Back move, dots reflect position, card 5 shows "Get started".
- ✅ Skip, Escape and Get started each close it, mark the store, call the API once; ✅ replay mode calls nothing.
- ❌ The API call rejects → it still closes, no toast.
- ✅ Arrow keys move cards; focus starts inside the dialog.
- ✅ TabLayout shows the walkthrough only when `tutorial.walkthrough`.
- ✅ Save tip: shown above the first bookmarkable card; not above own/rated posts; ❌ hidden when `saveTip` false; "Got it" dismisses and calls the API; a successful save dismisses it.
- ✅ List tip: above the first rateable saved card; ❌ hidden when no rateable card or `listTip` false; "Got it" and a submitted rating dismiss it.
- ✅ Profile: the "How BookRough works" row opens the walkthrough in replay mode.

**E2E** — none new: not a golden loop. `TUTORIAL_ENABLED=false` in `e2e/playwright.config.ts`'s backend env and `main.yml`, so the existing loops are unaffected.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                      | Reason                                                                                                     |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-11-10 | Form: a five-card walkthrough **and** in-place tips                           | Developer chose "both": one overview, plus help at the exact step where people got stuck                   |
| 2026-11-10 | Tips: only the save tip (feed) and the list tip (My List)                     | The two steps of the rating loop the manual test missed; Share is already prominent and in the walkthrough |
| 2026-11-10 | Seen state on the account (three timestamp columns), not `localStorage`       | iOS gives the installed PWA storage apart from Safari; per-device state would repeat it on install         |
| 2026-11-10 | Existing users see it once too; no backfill                                   | Small group; the N4 evidence came from an existing user                                                    |
| 2026-11-10 | `TUTORIAL_ENABLED` env (environment-wide off switch), not a per-account flag  | Developer: for testing; a fresh test account would see the walkthrough before a column could be set        |
| 2026-11-10 | Five cards as listed in §5.1                                                  | Developer approved the list                                                                                |
| 2026-11-10 | Replay from My Profile shows the cards only; tips never return                | Card 4 explains the same thing as the tips                                                                 |
| 2026-11-10 | Own endpoint `PATCH /users/me/tutorial` instead of a key on `PATCH /users/me` | `PATCH /users/me` carries the profile's onboarding rules and avatar side effects; seen state is unrelated  |
| 2026-11-10 | Marking seen is fire-and-forget; failure silent                               | A toast about help text is noise; the cost of failure is seeing it once more                               |
