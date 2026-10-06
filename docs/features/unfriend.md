# Feature: Unfriend

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-8 (remove a friend); UC-8 amended (§9)                          |
| **Phase**     | 5 — Step 5.3 of `DEVELOPMENT.md` (see `find-people.md` §0)         |
| **Branch**    | `feat/unfriend`                                                    |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

A user removes someone from their friends — from a ⋯ button on that friend's row in **Your friends**, or from the **Friends** button on their profile — after confirming. The friendship is gone for both people at once, silently: the other person is not told, and either of them may send a new request later. Nothing else changes; shared communities are untouched.

## 2. Scope

**In scope**

- `DELETE /api/friends/:userId` (§4).
- The ⋯ button on each row of Your friends, and the profile's Friends label becoming a button — both opening one confirmation sheet (§5).
- UC-8's fail path: the friend stays and a toast explains (§5).
- Doc updates (§9).

**Out of scope** — deliberately

- Telling the removed person anything; a notification stub (developer's choice, option A).
- Stopping the removed person from sending a new request (option B rejected: a soft block).
- Removing several friends at once; undo.
- Any effect on communities, posts, ratings or bookmarks.
- Offline reading of the Friends screen — Phase 6. Offline, Remove is disabled.
- Visual design: placeholders from existing primitives.

## 3. Data model changes

None. Unfriending deletes the `friends` row (an `ACCEPTED` one, in whichever direction it was created).

## 4. API

### `DELETE /api/friends/:userId`

- **Auth:** signed in and onboarded (`requireAuth`; `403` "Finish your profile first." otherwise).
- **Behaviour:** deletes the **accepted** row between the caller and `:userId`, in either direction. A pending request in either direction is never touched (cancel and ignore exist for those). Idempotent: when they are not friends, nothing changes and the call still succeeds. No notification.
- **Success:** `200 { friendship: Friendship }` — the relation after the call: `NONE`, or `REQUEST_SENT` / `REQUEST_RECEIVED` if that is what exists.
- **Errors:** `401`; `403` mid-onboarding; `404` "User not found." — a malformed id, an unknown user, or one mid-onboarding.

### Logging

`info` `{ userId, friendId }` "Friend removed" when a row was deleted. Ids only.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 The confirmation sheet (`components/RemoveFriendSheet.tsx`)

- Title "Remove friend?"; body "Remove {name} from your friends? They won't be notified."; **Remove friend** and **Cancel**.
- While the request runs: Remove friend is busy, the sheet cannot be dismissed.
- Success: the sheet closes; toast "Removed {name} from your friends."
- Failure: the sheet closes, the friendship stays, toast UC-8's "Action failed. Please check your internet connection and try again."
- Offline: Remove friend is disabled.

### 5.2 Friends screen — Your friends

- Each row: `PersonLink` and, beside it, a ⋯ button ("Actions for {name}", 44 px) that opens the sheet.
- On success the row leaves the list (kept against the loaded page, as accepts are).
- Offline: the ⋯ buttons are disabled.

### 5.3 Public Profile — the friend control

- `FRIENDS`: the "✓ Friends" label becomes a secondary button with the same text, opening the sheet. On success the control becomes **Add Friend**.
- Offline: disabled, like the other states.

## 6. Edge cases & failure modes

- **Already removed** (by the other person, or in another tab): `200` with `NONE`; the UI shows the result as success — the outcome the user wanted.
- **The other person had a pending request in flight:** impossible while they are friends (one row per pair).
- **The friend deleted their account:** the row is gone by cascade; a stale Friends list shows them until the call answers `404` "User not found." — the row leaves and the server's message is toasted.
- **Network drop mid-request (UC-8):** the friend stays; the toast; Try again by reopening the sheet.
- **Re-friending later:** either may send a request; the usual flow applies.

## 7. Test scenarios

**Unit — `friend.service`**

- ✅ Unfriend deletes the accepted row in either direction, logs, and returns `NONE`.
- ✅ Unfriend is idempotent when not friends, and never touches a pending request in either direction (returns `REQUEST_SENT` / `REQUEST_RECEIVED`).
- ❌ Unfriend → `404` for an unknown or mid-onboarding user; `403` mid-onboarding.

**Integration (Supertest)**

- ✅ A and B are friends → A removes B → both `/friends` lists are empty and both profiles say `NONE`; either can send a new request.
- ✅ The friendship can be removed by either party, whichever direction it was created in.
- ✅ Removing a non-friend is `200 NONE`; a pending request survives a remove call.
- ❌ `404` malformed / unknown id; `401` signed out; `403` mid-onboarding.

**Component (Vitest + RTL)**

- ✅ Friends: ⋯ → sheet → Remove friend → the row leaves and toasts.
- ❌ Friends: a failure keeps the row and toasts UC-8's message; a `404` removes the row and toasts the server's message; offline disables ⋯.
- ✅ Profile: Friends → sheet → Remove friend → Add Friend.
- ❌ Profile: a failure keeps Friends and toasts.
- ✅ Sheet: Cancel closes without a request.

**E2E** — the Phase 5 loop ends here.

- Extend the friend-request spec: after accepting, the receiver removes the sender from Your friends; the sender's profile of them shows Add Friend after a reload. (Chromium and iPhone WebKit.)

## 8. Open questions & risks

- None at approval.

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: UC-8 — from the Friends tab's ⋯ or the profile's Friends button; silent; either may re-request; the failure is a toast.
- `docs/frontend screens.md` + `.docx`: 2.3 (the ⋯ on Your friends), 2.4 (Friends opens the remove sheet).
- `docs/tables.md` + `.docx`: `friends` — unfriending deletes the row.
- `docs/features/friend-requests.md`: Merged ticked.
- `DEVELOPMENT.md`: Step 5.3's entry per §13.

## 10. Decisions log

| Date       | Decision                                                                                  | Reason                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | Unfriending is silent and resets to no relation; either may re-request (option A)         | Mirrors Ignore; no schema change; no soft block                                                                                       |
| 2026-10-06 | From a ⋯ on the Friends row and from the profile's Friends button, one confirmation sheet | UC-8 names both places; one component                                                                                                 |
| 2026-10-06 | Idempotent `200`; only an accepted row is ever deleted                                    | Two tabs or both people removing at once are harmless; requests have their own endpoints                                              |
| 2026-10-06 | UC-8's failure message as a toast, not a banner                                           | Consistent with every other friend action                                                                                             |
| 2026-10-06 | Stage 3: the profile shows the relation the remove call returns, not a guessed `NONE`     | `/code-review`: on a stale profile, a removal that found a new incoming request showed Add Friend, whose tap would silently accept it |
