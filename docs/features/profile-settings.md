# Feature: My Profile / Settings

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------- |
| **Use cases** | UC-4 (edit account details), UC-3 (log out — visible on this screen)                         |
| **Phase**     | 2 — Step 2.4 of `DEVELOPMENT.md` (re-sliced; absorbs former 2.4 and the profile half of 2.5) |
| **Branch**    | `feat/profile-settings`                                                                      |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                           |

---

## 1. Goal

The Profile tab becomes the real **My Profile / Settings** screen. A user can change their display name and preferred streaming service, switch between the generated avatar and their Google photo in either direction, and sign out. Going back to the Google photo after declining it needs a fresh Google sign-in, so the photo is stored only at the moment the user explicitly asks for it.

## 2. Scope

**In scope**

- Editing display name (same rules and live availability check as onboarding) and preferred service, reusing `PATCH /api/users/me`.
- Switching to the generated avatar (deletes the stored photo) — reusing `PATCH /api/users/me`.
- **New:** `POST /api/users/me/google-picture` — re-choose the Google photo with a fresh Google credential.
- The full My Profile / Settings screen at `/profile`, replacing the minimal Profile tab from `communities-create.md`.
- Shared components extracted from Complete Your Profile so both screens use one implementation: the display-name field with its status line, and the streaming-service picker.
- A lower-level Google credential button extracted from `GoogleSignIn` (feature 2), used both for signing in and for fetching the photo.
- Doc updates (§9), resolving the open item in `onboarding.md` §2.

**Out of scope** — deliberately

- Rename limits or holding freed names (developer's choice, option A: rename any time; the old name is free at once).
- Account deletion — not a UC; raise one if wanted.
- Uploading a photo — never (CLAUDE.md §8).
- Seeing or changing anything else from Google (name, email) — the app never stores them (CLAUDE.md §5).
- Notification or privacy preferences — nothing exists to configure.
- Public User Profile (UC-6) — Phase 5.

## 3. Data model changes

None. The columns from Phase 1 (`display_name`, `display_name_key`, `preferred_service`, `profile_picture_url`, `use_google_picture`) cover everything.

**Photo lifecycle — one new row** (extends `onboarding.md` §3):

| User state / action                                     | Effect                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Signs in, onboarded, `use_google_picture = false`       | Store nothing (unchanged)                                                          |
| Switches to the generated avatar                        | `profile_picture_url = null`, `use_google_picture = false` (unchanged)             |
| **Re-chooses the Google photo with a fresh credential** | **`profile_picture_url = <picture from that token>`, `use_google_picture = true`** |

## 4. API

All responses use the CLAUDE.md §4 envelope; `400` unparseable JSON, `422` validation failure.

### `PATCH /api/users/me` — reused, behaviour unchanged

Already supports `{ displayName?, preferredService?, useGooglePicture? }` for an onboarded user (`onboarding.md` §5). This screen sends:

- `{ displayName?, preferredService? }` on **Save changes** (only the changed fields).
- `{ useGooglePicture: false }` on **Use generated avatar**.

Errors as specified there: `409` name taken (including a race), `422` invalid / reserved name or unknown service, `401`.

`useGooglePicture: true` through this endpoint still requires a stored photo (`422` "There is no Google photo to use." otherwise); the screen never sends it — re-choosing goes through the endpoint below.

### `POST /api/users/me/google-picture` — new

- **Auth:** required (`requireAuth`); onboarding must be complete.
- **Request:** `{ credential: string }`, Zod `.strict()`, 1–4096 characters — the Google ID token from the popup.
- **Behaviour:** verify the token exactly as sign-in does (`verifyGoogleIdToken`: signature, audience, issuer, expiry). The token's `sub` must equal the caller's `google_sub`. Read `picture`; discard every other claim (CLAUDE.md §5). Store `profile_picture_url = picture`, `use_google_picture = true`.
- **Success:** `200` `{ user: PublicUser, needsOnboarding: false }` — the same session shape as `/auth/me`, so the store updates in one call.
- **Errors:**
  - `400` body not JSON; `422` missing / empty / too long `credential`, extra key.
  - `422` "Google sign-in didn't complete. Please try again." — the token fails verification. **Not `401`:** the caller's own session is fine, and a `401` would make the client interceptor sign them out (CLAUDE.md §4).
  - `403` "That's a different Google account. Use the account you signed up with." — `sub` mismatch.
  - `422` "Your Google account has no photo." — the token carries no `picture`.
  - `403` "Finish your profile first." — onboarding not complete.
  - `503` "Google sign-in is temporarily unavailable." — Google's keys unreachable.
  - `401` no session.

### Logging

`info` on photo re-chosen and on switch to generated, with `{ userId }`. Never the credential, the picture URL, or any Google claim.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 My Profile / Settings (`pages/Profile.tsx`, replaces the minimal version)

Top to bottom:

1. **Heading** "Your profile".
2. **Avatar:** the current avatar (Google photo or generated initials), and one action depending on the current choice:
   - using the Google photo → **Use generated avatar** (no confirmation; it is reversible). Line under it: "Your Google photo will be deleted from BookRough."
   - using the generated avatar → **Use my Google photo**, which shows the Google button ("Continue with Google to fetch your photo"). Line: "We'll fetch your current photo from Google. Nothing else is kept."
3. **Display name:** the onboarding field and status line (counter `n/20`, local rules, debounced availability check, "taken" / "reserved" / "Couldn't check right now"). The caller's own current name counts as available (already true server-side).
4. **Where do you listen?** — the five-option service picker from onboarding, current choice selected.
5. **Save changes** — enabled only when the name or the service differs from the saved value and the name is usable. Busy "Saving…". Success → toast "Profile updated" and the store refreshes (UC-4 success path, minus "successfully" per the copy rules). `409` → the name status switches to "taken" and values are kept.
6. **Sign out** — a visible secondary button at the bottom (UC-3), as today.

**States**

- **Loading:** none — the screen renders from the session already in the store.
- **Avatar switch in progress:** that control busy ("Switching…" / the Google button replaced by "Fetching your photo…"); Save and the other avatar action disabled meanwhile.
- **Errors:** avatar errors inline under the avatar (the server's message: different account, no photo, sign-in didn't complete, unavailable); save errors other than `409`/`422` inline above Save; a closed or failed Google popup → "Google sign-in didn't complete. Please try again."
- **Offline:** banner "You're offline. Connect to change your profile." — Save and both avatar actions disabled; Sign out stays enabled (it fails gracefully and keeps the session, as today).

### 5.2 Shared components

- `components/DisplayNameField.tsx` — the name input, counter and status line; used by Complete Your Profile and My Profile.
- `components/StreamingServicePicker.tsx` — the five radio options; used by both.
- `components/GoogleCredentialButton.tsx` — Google's button, its script-load / offline / popup errors, and a busy state; calls `onCredential(credential)`. `GoogleSignIn` (Welcome, invite preview) becomes a thin wrapper that posts the credential to `/auth/google`; My Profile posts it to `/users/me/google-picture`.

Existing Complete Your Profile and Welcome tests must pass unchanged — the proof that the extractions changed no behaviour.

## 6. Edge cases & failure modes

- **Signing in with a different Google account in the photo popup:** `403`, nothing stored, the message names the problem.
- **Google account with no photo:** `422`, the generated avatar stays.
- **Google photo URL later 404s:** the avatar falls back to initials (unchanged behaviour).
- **Rename to a name that was just freed by someone else:** allowed — no holds (option A).
- **Rename race:** two users save the same name; the second gets `409` and sees "taken".
- **Rename to the current name with different case or spacing** ("ofri " for "Ofri"): same key as their own → available; saved as typed.
- **Change only the service:** allowed for an onboarded user (unchanged server rule).
- **Session expires mid-edit:** the `401` interceptor signs them out; unsaved edits are lost (accepted, as elsewhere).
- **Rapid double tap on an avatar action:** the busy state prevents a second request.
- **The installed iPhone PWA and the Google popup:** the same known risk as sign-in (`google-auth.md` §8), re-tested in Phase 6.

## 7. Test scenarios

**Unit (`services/user.service.ts` addition, frontend components)**

- ✅ `rechooseGooglePicture` stores the token's picture and sets the flag.
- ❌ `sub` mismatch → `AppError 403`; no picture → `422`; verifier rejects → `422` (mapped from the sign-in `401`); key fetch fails → `503`; caller not onboarded → `403`.
- ✅ The only claim read besides `sub` is `picture`; the stored row contains no other Google data.
- ✅ Frontend `DisplayNameField` and `StreamingServicePicker` render and report changes (covered through both screens' tests).

**Integration (endpoints)** — `google-auth-library` mocked

- ✅ `POST /users/me/google-picture` → `200`, row has the new URL and `use_google_picture = true`, response is the session shape.
- ❌ `400` bad JSON; `422` missing / empty credential, extra key; `422` invalid token; `422` no picture; `403` different `sub`; `403` not onboarded; `503` keys unreachable; `401` no session (and a `422`/`403` here never clears the session cookie).
- ✅ After re-choosing, signing in again refreshes the photo (the existing "onboarded + chosen" rule).
- ✅ `PATCH /users/me { useGooglePicture: false }` after re-choosing → URL null again.
- 🔒 Privacy: the mocked token carries `email` and `name`; neither appears in the row, the response, or captured logs.

**Component (Vitest + RTL)**

- ✅ Renders the current avatar, name, service; Save disabled until something changes.
- ✅ Edit name → availability states → Save sends only changed fields → toast "Profile updated", store updated.
- ✅ Change only the service → Save sends `{ preferredService }`.
- ❌ `409` on save → "taken", values kept; ❌ other failure → inline error.
- ✅ Using the Google photo → **Use generated avatar** → request, avatar becomes initials.
- ✅ Using the generated avatar → Google button → credential posted → photo shown.
- ❌ Different account / no photo / popup failed → the matching inline message; the avatar unchanged.
- ❌ Offline → banner; Save and avatar actions disabled; Sign out enabled.
- ✅ Sign out (existing tests stay green).
- ✅ Complete Your Profile and Welcome suites pass unchanged after the extractions.

**E2E (Playwright)**

- ✅ An onboarded user changes their display name and service on My Profile; after a reload both persist.
- ✅ The user switches to the generated avatar and back to their Google photo through the stand-in popup.

## 8. Open questions & risks

- **Popup on the profile screen inside the installed iPhone PWA** — same risk and fallback as sign-in (`google-auth.md` §8); tested in Phase 6.
- **No dependencies added.**

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: UC-4 — the avatar can be switched both ways; going back to the Google photo needs a fresh Google sign-in; the success toast reads "Profile updated". UC-3 — Sign out lives on My Profile.
- `docs/frontend screens.md` + `.docx`: 4.3 My Profile / Settings — sections and states (§5.1).
- `docs/auth.md` + `.docx`: the photo lifecycle's new row (explicit re-choose with a fresh credential).
- CLAUDE.md §5 step 4 and §8: "a declined photo is deleted and never stored again — unless the user explicitly re-chooses it with a fresh Google sign-in".
- `docs/features/onboarding.md`: the "Re-choosing the Google photo later" out-of-scope item points here.
- `DEVELOPMENT.md`: Step 2.4 filled per §13. `communities-membership.md`: Merged ticked.

## 10. Decisions log

| Date       | Decision                                                                                           | Reason                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-04 | Re-choosing the Google photo needs a fresh Google sign-in; the token's `sub` must match (option A) | Keeps "stored only by explicit choice"; the photo is current and from the same account |
| 2026-10-04 | No rename limits; a freed name is available at once (option A)                                     | Low risk in a friend group; removal from a community handles impersonation             |
| 2026-10-04 | A failed Google token on the photo endpoint is `422`, not `401`                                    | A `401` would make the interceptor sign out a user whose session is valid              |
| 2026-10-04 | Name field, service picker and Google button extracted into shared components                      | Onboarding and My Profile must apply identical rules and states                        |
