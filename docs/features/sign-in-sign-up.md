# Feature: Separate Sign in from Create account

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                  |
| ------------- | -------------------------------------------------------------------------------- |
| **Use cases** | UC-1 (registration) and UC-2 (login), amended: two intents instead of one button |
| **Phase**     | 6 — Step 6.1f of `DEVELOPMENT.md`, from manual-test note **N9** (§0)             |
| **Branch**    | `feat/sign-in-sign-up`                                                           |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged               |

---

## 0. Where this comes from

Note **N9** of the manual test session (`docs/manual-tests/2026-11-04.md` §7). Today one **Continue with Google** button serves a returning user and a new one alike. The developer asked for them to be separated.

**This reverses a recorded decision.** CLAUDE.md §5 and `docs/auth.md` say "Sign-up and login are the same button". This PR updates both, `auth` as .md + .docx. With Google there's no password either way, so the split is about clarity, not security.

Decided in this spec session, 2026-11-08:

| #   | Question                       | Decision                                                                                                                                                   |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Copy only, or two intents?     | **Two intents**: Sign in and Create account. The server is told which.                                                                                     |
| D2  | Sign in, but no account exists | **Refuse; create nothing.** "No account for this Google account yet." plus a **Create account** button that finishes at once, with no second Google popup. |
| D3  | Create account, but one exists | **Sign in anyway**, with the toast "You already have an account. Signing you in." Harmless, so no refusal.                                                 |

## 1. Goal

A newcomer knowingly creates an account, and a returning friend knowingly signs in. Choosing the wrong one never creates a stray account or ends in a dead end.

## 2. Scope

**In scope**

- `POST /api/auth/google` takes an `intent` (`signin` | `signup`).
- On **Welcome** and the **invite preview**: a two-option switch, **Sign in** | **Create account**, above **one** Google button. Its label follows the switch: "Sign in with Google" or "Sign up with Google".
  - **Why one button and not two:** Google's script keeps a single global callback. With two Google buttons on one page, the last one rendered receives both clicks, so the intent would be wrong. One button that reads the switch is the reliable shape.
- The D2 recovery: the credential is kept in memory only, and **Create account** resends it with `signup`.
- Updating CLAUDE.md §5, `auth` (.md + .docx), `use cases` UC-1 and UC-2 (.md + .docx), and `frontend screens` 1.1 Welcome and 3.5 Join Community (.md + .docx), plus an amendment note in `google-auth.md`.

**Out of scope**

- A second identity provider, email or passwords. Google stays the only way in (§5).
- Deleting an account, or "this isn't me" flows.
- Remembering which option a device used last. The switch always starts on **Sign in** on Welcome, and on **Create account** on an invite preview, where a newcomer is the likely reader.
- Visual design beyond the simplest placeholder.

## 3. Data model changes

None.

## 4. API

### `POST /api/auth/google`

- **Request:** `{ credential: string, intent?: 'signin' | 'signup' }`, `.strict()`.
  - An absent `intent` keeps today's behaviour (find or create), so a client built before this change, such as an installed PWA's cached shell, still works. Today's clients always send it.
- **Behaviour:** the token is verified exactly as now (audience, issuer, expiry). Then:
  - `signin` and an account exists: sign in, as today.
  - `signin` and **no** account: **`404`** "No account for this Google account yet." Nothing is written and no cookie is set.
  - `signup` and no account: create it, then sign in, as today's first sign-in.
  - `signup` and an account **exists**: sign in. The response says `created: false`.
- **Success `200`:** the session payload as today, plus `created: boolean` (true only when this call created the account).
- **Errors:**
  - `401` for an invalid token, as today.
  - `404` for D2.
  - `422` for an unknown key, or an `intent` that's neither value.
  - `429` for tier 2 (`signIn`), as today. The D2 retry counts too.
- **Privacy:** the `404` reveals only whether the caller's **own** verified Google account has a BookRough account. Nobody can ask about someone else's.
- **Logging:** `info` `{ userId, isNewUser, intent }` on success, and `info` `{ intent: 'signin' }` "Sign in without an account" on D2. Never the email or the token.

## 5. Screens & components

### 5.1 `GoogleSignIn` (shared by Welcome and the invite preview)

- **The switch:** two toggle buttons (`aria-pressed`) in a labelled group, "Sign in" | "Create account", 44px tall. It's keyboard accessible and labelled "How do you want to continue?".
- **The button:** one `GoogleLogin` with `text` `signin_with` or `signup_with`, following the switch.
- **Busy:** "Signing you in…" or "Creating your account…".
- **D2:** an inline notice replaces the button: "No account for this Google account yet." with **Create account**, which resends the kept credential with `signup`, and **Use another Google account**, which drops the credential and shows the button again.
- **D3:** the toast "You already have an account. Signing you in." Then the usual flow continues, and the guards route to Home or onboarding.
- **Errors:** the existing four inline errors (popup failed, script blocked, offline, server) are unchanged.

### 5.2 Welcome

- The tagline and the wordmark stay. The single "Continue with Google" is replaced by §5.1, with the default **Sign in**. The "No passwords. We never store your email." line stays.

### 5.3 Join Community (invite preview)

- "Continue with Google to join" becomes "Sign in or create an account to join". §5.1 follows, with the default **Create account**.

## 6. Edge cases & failure modes

- **The kept credential expired** (more than about an hour on the D2 notice): Create account gets `401`. The notice turns into "Your Google sign-in expired. Try again." and the button returns.
- **Two tabs creating at once:** the existing `P2002` race handling. Both land on one account, and the second gets `created: false`, so the D3 toast shows.
- **Signing in with a half-onboarded account:** that's an account, so it signs in and the guards send it to Complete Your Profile, as today.
- **An old cached client without `intent`:** today's behaviour (§4).
- **Offline:** the existing offline message, with the switch disabled.

## 7. Test scenarios

**Unit (services):** `auth.service` `authenticateWithGoogle(credential, intent)`

- ✅ `signin` with an account → the user, `isNewUser: false`.
- ❌ `signin` without one → `AppError` 404, and no create.
- ✅ `signup` without one → created, `isNewUser: true`.
- ✅ `signup` with one → the existing user, `isNewUser: false`.
- ✅ No intent → find or create (legacy).
- ✅ `signup` racing (P2002) → the existing user, `isNewUser: false`.

**Integration (endpoints)**

- ✅ `200` signin for an existing account, with the cookie set and `created: false`.
- ✅ `200` signup for a new account, with `created: true` and `needsOnboarding: true`.
- ✅ `200` signup for an existing account, with `created: false` and no new row.
- ❌ `404` signin without an account: no row, no cookie.
- ❌ `422` for `intent: 'register'`, or an extra key.
- ❌ `401` for a bad token, with either intent.
- ✅ `200` with no intent (legacy).

**Component**

- `GoogleSignIn`:
  - ✅ The switch changes the Google button's text and the intent sent.
  - ✅ Welcome defaults to Sign in, and the invite preview to Create account.
  - ❌ A `404` shows the notice, then Create account resends the same credential with `signup`.
  - ✅ Use another Google account clears the notice.
  - ❌ The expired credential on retry shows the message.
  - ✅ D3 toasts.
- `Welcome` and `InvitePreview`: render the switch. The existing tests are updated.

**E2E** (golden loop, existing)

- `support/googleStandIn.ts`: the stub button's label follows Google's `text` option ("Sign in with Google" or "Sign up with Google").
- `support/flows.ts` `signIn()` picks **Create account** for a new account, and the re-sign-in in `auth-flow.spec.ts` picks **Sign in**.
- One new case: Sign in with a brand-new Google account shows the notice, and Create account lands on Complete Your Profile.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                           | Reason                                                                                          |
| ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-11-08 | D1–D3 (§0)                                                                         | Developer's choices in the spec session.                                                        |
| 2026-11-08 | One Google button behind a Sign in / Create account switch, not two Google buttons | Google's script has one global callback, so two buttons on a page would mix up the intents.     |
| 2026-11-08 | `intent` is optional, and absence keeps find-or-create                             | An installed PWA's cached shell must not break on deploy.                                       |
| 2026-11-08 | D2 is a `404` with nothing written, and the retry reuses the credential in memory  | No stray accounts, and no second popup. The `404` only ever describes the caller's own account. |
