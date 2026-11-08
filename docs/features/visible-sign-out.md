# Feature: Visible sign-out

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-3 (logout) — its optional confirmation step becomes real        |
| **Phase**     | 6 — Step 6.1c of `DEVELOPMENT.md`, from manual-test note N8 (§0)   |
| **Branch**    | `feat/visible-sign-out`                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 0. Where this comes from

Note **N8** of the manual test session (`docs/manual-tests/2026-11-04.md` §7): sign-out lives only at the bottom of My Profile, and the developer wants it somewhere visible. Decided in this spec session, 2026-11-08:

- **Placement:** in the Home screen's header, beside "Your communities". The bottom nav keeps its five tabs.
- **Confirmation:** both sign-out buttons (Home and My Profile) open a **"Sign out?"** confirmation first.

**Recorded exception to §15's order.** The developer chose to build the manual-test notes (N1–N10, except N4) before Step 6.2. PR #40 (`feat/pwa-offline`) stays open, because its iPhone checks O1–O9 need a Vercel preview and the team is paused until 2026-11-11. The new controls follow the offline-write pattern from PR #40 (§5.3), so rebasing it later stays simple. **N4** (the onboarding tutorial) comes last, after a UI redesign the developer plans once these notes are done.

## 1. Goal

A signed-in user can sign out from the screen the app opens on, without hunting for it on My Profile. One accidental tap can't end the session, because both entry points ask first.

## 2. Scope

**In scope**

- A **Sign out** button in the Dashboard (Home) header, on the same row as the "Your communities" heading.
- A shared **`SignOutSheet`** confirmation, opened by the Home button and by the existing My Profile button.
- Offline handling in that sheet, following PR #40's pattern (§5.3).
- Amending the docs to say where sign-out lives. That's UC-3 in `use cases` (where its "confirm (optional)" step becomes real) and the Dashboard and My Profile entries in `frontend screens`, both .md + .docx (§14.1). It also means an amendment note in `profile-settings.md`, Step 6.1c and the §0 exception in `DEVELOPMENT.md`, and the same exception in `HANDOFF.md`.

**Out of scope**

- **Complete Your Profile**'s small "Sign out" link. It stays as it is, with no confirmation: it's the escape hatch for an account that has just been created, it has no tab bar, and PR #40 already changes it.
- A sixth tab, a header bar on the other tab screens, or a menu.
- Any backend change. `POST /api/auth/logout` is unchanged.
- Visual design beyond the simplest placeholder: a secondary text button. The look is left to the planned redesign.

## 3. Data model changes

None.

## 4. API

None new. The existing `POST /api/auth/logout` is called through the existing `useSignOut` hook:

- Success: the cookie is cleared, the store is cleared, the route guards send the user to Welcome, and a pending invite is dropped (as today).
- `401` (the session already expired): the axios interceptor clears the store and redirects to `/` (UC-3's alternative scenario, as today).
- A network or `5xx` failure: the interceptor toasts and the session is kept (as today). The sheet stays open, and its button is usable again.

## 5. Screens & components

### 5.1 Communities Dashboard (Home)

- The heading row becomes a flex row: the `h1` "Your communities" on the left and a secondary **Sign out** button on the right, at least 44×44px (§8). The heading truncates before it pushes the button off-screen at 375px.
- The button is present in every Dashboard state (loading, error, empty, list), because the header sits outside the request states.
- Tapping it opens `SignOutSheet`.

### 5.2 My Profile

- The existing **Sign out** button at the bottom now opens `SignOutSheet` instead of signing out at once. Nothing else on the screen changes.

### 5.3 `SignOutSheet` (new, `frontend/src/components/SignOutSheet.tsx`)

Built on the existing `Sheet`, in the same shape as `RemoveFriendSheet`:

- **Title:** "Sign out?"
- **Body:** "You'll need to continue with Google to sign back in."
- **Buttons:** **Cancel** (secondary), which closes the sheet and does nothing else, and **Sign out** (primary), which calls `useSignOut().signOut`.
- **Busy:** the primary button reads "Signing out…" with the busy state, Cancel is disabled, and the sheet can't be dismissed by the backdrop or Escape (`dismissible={!busy}`).
- **Failure:** the interceptor's toast shows. The sheet stays open with both buttons usable again, so the user can retry or cancel.
- **Offline** (PR #40's pattern): the primary button is disabled, with the note "You're offline. Connect to sign out." beneath. The `HttpOnly` cookie can only be cleared by the server, so an offline "sign-out" would be a lie. The sheet still opens offline, so the reason is visible. On `main` this reads `useOnlineStatus()`. Once PR #40 merges, the same hook also covers a session that's still unconfirmed, with no change here.
- **Behaviour change on My Profile:** today, sign-out there stays enabled offline (profile-settings.md §5.1). It's now disabled offline inside the sheet, the same behaviour PR #40 gives it. profile-settings.md gets an amendment note.

## 6. Edge cases & failure modes

- **Session already expired** when confirming → `401` → the interceptor clears it and Welcome shows (UC-3's alternative scenario). The sheet unmounts with the route.
- **The network drops mid-request** → a toast, the session is kept, and the sheet is usable again.
- **The connection goes offline while the sheet is open** → the primary button disables live (the hook listens to `online`/`offline`).
- **Double tap on Sign out** → the busy state disables the button after the first tap, so only one request goes out.
- **A pending invite** → dropped on a successful sign-out (unchanged `useSignOut`).

## 7. Test scenarios

**Unit (services)**: none, since there's no backend change.

**Integration (endpoints)**: none, since the endpoint is unchanged and already covered.

**Component** (Vitest + RTL)

`SignOutSheet.test.tsx`

- ✅ Renders the title, the body and both buttons.
- ✅ Cancel closes it without calling logout.
- ✅ Sign out calls logout, clears the auth store and drops the pending invite.
- ✅ While signing out: "Signing out…", Cancel disabled, and Escape doesn't close it.
- ❌ Logout fails → the session is kept, the sheet stays open, and Sign out is enabled again.
- ❌ Offline → Sign out disabled and the offline note shown. Going back online re-enables it.

`Dashboard.test.tsx`

- ✅ The header shows a Sign out button in the list, empty, loading and error states.
- ✅ Tapping it opens the "Sign out?" sheet. Cancel closes it, and the user stays signed in.

`Profile.test.tsx` (updated)

- ✅ Sign out opens the sheet, and confirming signs out (it replaces today's direct sign-out test).
- ❌ Logout fails → the session is kept (moved to go through the sheet).
- ❌ Offline → the existing "Sign out stays enabled" assertion becomes: the Profile button opens the sheet, whose Sign out is disabled with the note.

`App.test.tsx`: the existing CompleteProfile sign-out loop is unchanged (out of scope).

**E2E** (golden loop, already exists)

- `e2e/support/flows.ts` `signOut()` now signs out from the Home header and confirms in the sheet, which keeps the register → sign out → sign in loop covering the new path. The CompleteProfile sign-out step in `auth-flow.spec.ts` is unchanged.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                            | Reason                                                                             |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 2026-11-08 | The Home header, not a sixth tab or an app-wide header              | The most visible screen. The bottom nav is full at 375px.                          |
| 2026-11-08 | A confirmation on both Home and My Profile                          | The developer's choice: one behaviour everywhere, and no accidental sign-outs.     |
| 2026-11-08 | Disabled offline inside the sheet                                   | PR #40's pattern. The server alone can clear the `HttpOnly` cookie.                |
| 2026-11-08 | Complete Your Profile's link is left alone                          | An onboarding escape hatch. PR #40 already edits it, so we avoid a conflict.       |
| 2026-11-08 | `SignOutButton` (trigger + sheet) is exported beside `SignOutSheet` | Home and My Profile need the same open/close state; one component, not two copies. |
