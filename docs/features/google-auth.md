# Feature: Sign in with Google

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-1 (account creation, first half), UC-2 (login), UC-3 (logout)   |
| **Phase**     | 1 — merges former Steps 1.1, 1.3 and 1.5 of `DEVELOPMENT.md`       |
| **Branch**    | `feat/auth-google`                                                 |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged |

---

## 0. Why three steps became one feature

`DEVELOPMENT.md` split Phase 1 by layer: the `users` table (1.1), the auth API (1.3) and the Welcome screen (1.5). Neither 1.1 nor 1.3 would have shipped anything a person could click, which is exactly what CLAUDE.md §11 forbids ("don't merge backend only"). They are merged into one vertical slice. Onboarding (former 1.6) stays a separate, second feature because it carries its own UX decisions; Phase 1 E2E (former 1.7) stays last because its golden loop runs through onboarding.

## 1. Goal

A person opens BookRough, taps **Continue with Google**, and is signed in. A first-time user gets an account row and lands on the (still placeholder) Complete Your Profile screen; a returning user who has finished onboarding lands on the (still placeholder) home screen. The session lasts 30 days and renews itself with use. Signing out works from either screen. The application never learns the user's email address or real name.

## 2. Scope

**In scope**

- The first migration: the `users` table and its two enums.
- `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`.
- JWT session cookie, `requireAuth` middleware with sliding renewal, `toPublicUser` serialiser.
- Error handler: malformed JSON bodies become `400` instead of falling through to `500`.
- The real Welcome screen, the Zustand auth store, session bootstrap on app load, route guards.
- Placeholder Complete Your Profile and Home screens, each showing who is signed in and a Sign out button.
- The visual foundation: semantic design tokens (light + dark), self-hosted fonts, the first `components/ui/` primitives.
- Doc updates forced by the decisions below (§9): `tables`, `auth`, `use cases`, `frontend screens`, `general`, `system architecture conventions`, `git workflow`, `tech stack` (each `.md` + `.docx`), `CLAUDE.md`, `DEVELOPMENT.md`.

**Out of scope** — deliberately

- The onboarding form, `PATCH /api/users/me`, display-name normalisation and its length/character rules — next feature (`docs/features/onboarding.md`).
- The communities dashboard — Phase 2. `/home` is a placeholder.
- Google One Tap / automatic sign-in prompts. One button, pressed on purpose.
- Account deletion. Not a UC yet; raise it as a new UC if wanted.
- Exposing `role` to the frontend — arrives with the admin area (UC-19), which needs it.
- Server-side session revocation (a denylist). Accepted risk, see §6.
- Rate limiting `/api/auth/google`. Every call needs a valid Google-signed token for our client ID, so there is nothing cheap to brute-force. Revisit in Phase 6 hardening.
- A real logo and final visual design. The identity below is an approved placeholder; the token system exists so it can be replaced cheaply (§5.1).
- Service worker / PWA install — Phase 6.

## 3. Data model changes

Migration: `npx prisma migrate dev --name init_users`

```prisma
enum StreamingService {
  SPOTIFY
  APPLE_MUSIC
  YOUTUBE
  TIDAL
  DEEZER
}

enum UserRole {
  USER
  ADMIN
}

model User {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  googleSub         String            @unique @map("google_sub")
  displayName       String?           @map("display_name") @db.VarChar(50)
  displayNameKey    String?           @unique @map("display_name_key") @db.VarChar(50)
  profilePictureUrl String?           @map("profile_picture_url")
  preferredService  StreamingService? @map("preferred_service")
  role              UserRole          @default(USER)
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("users")
}
```

Decisions behind it (all from the Stage 1 session, 2026-10-01):

- **No `email`, no `password_hash`, no real name.** Google's `email` and `name` claims are read during verification and discarded. `google_sub` is opaque: nothing about the person can be derived from it.
- **No `username`.** There is one user-chosen name, `display_name`: free text in any language (Hebrew, emoji, spaces), changeable later, and **unique**. Profile URLs use `id`, so no URL-safe handle is needed.
- **Uniqueness is enforced on `display_name_key`**, a hidden column the server derives from `display_name` (normalised, whitespace-collapsed, lower-cased), so "Ofri" and "ofri " collide while the name is shown exactly as typed. Plain Prisma `@unique`, no hand-written SQL. The normalisation function itself is written in the onboarding feature; this feature only creates the column.
- **`display_name`, `display_name_key`, `preferred_service` are nullable.** The row is created at first sign-in, before the user has chosen any of them. Postgres allows many `NULL`s under a unique constraint, so unfinished accounts do not collide.
- **`preferred_service` has no database default.** "Has not chosen" and "chose Spotify" must stay distinguishable.
- `VarChar(50)` is a storage ceiling, not the UX limit; onboarding sets the real limit at or below it.
- `updated_at` is not in the original `tables.md`; added because it is free and the admin area will want it.
- UUIDs are generated by Postgres, so rows inserted outside Prisma (e.g. setting an admin by hand) still get one.

**Onboarding state** is derived, not stored: `needsOnboarding = displayName === null || preferredService === null`.

## 4. API

All responses use the CLAUDE.md §4 envelope. Status-code convention fixed here for the whole project: **`400`** = body is not parseable JSON; **`422`** = parseable but fails Zod validation.

### `PublicUser` — the only user shape that leaves the server

```ts
{
  id: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  preferredService: StreamingService | null;
  createdAt: string; // ISO 8601
}
```

Built field by field in `toPublicUser`. `googleSub`, `displayNameKey`, `role` and `updatedAt` are never sent.

### Session cookie

| Property | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Name     | `token`                                                                       |
| Content  | JWT, HS256, signed with `JWT_SECRET`; payload `{ sub: <user id> }`            |
| Lifetime | 30 days (`exp` and cookie `Max-Age`)                                          |
| Renewal  | `requireAuth` re-issues a fresh 30-day cookie when the token is > 15 days old |
| Flags    | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`     |

`Secure` is off in development because Safari refuses `Secure` cookies on `http://localhost`. `localhost:5173` and `localhost:4000` are the same _site_ (ports are ignored), so `Lax` works in dev.

**Constraint handed to Phase 6:** frontend and API must be deployed on the **same site** (same registrable domain, or the API proxied under the frontend's origin). A `Lax` cookie is not sent on cross-site API calls. Record this in `docs/deployment.md`.

The token carries only the user id. `requireAuth` loads the user row on every request, so a deleted user or a changed role takes effect immediately.

### `POST /api/auth/google`

- **Auth:** public
- **Request:** `Content-Type: application/json`, body `{ credential: string }` — the ID token `@react-oauth/google` returns. Zod: `z.object({ credential: z.string().min(1).max(4096) }).strict()`.
- **Behaviour:** `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })` (checks signature, `aud`, `iss`, `exp`). Read `sub` and `picture` only. Upsert by `google_sub`: create with `profile_picture_url = picture`; on an existing row, refresh `profile_picture_url` (Google picture URLs change). Set the cookie.
- **Success:** `200` `{ user: PublicUser, needsOnboarding: boolean }` — same status for new and returning users.
- **Errors:**
  - `400` — body is not valid JSON.
  - `422` — `credential` missing, empty, too long, or extra keys.
  - `401` "Google sign-in failed. Please try again." — bad signature, wrong audience, wrong issuer, expired, or no `sub`.
  - `503` "Google sign-in is temporarily unavailable." — Google's public keys could not be fetched (network failure, not a bad token).

### `GET /api/auth/me`

- **Auth:** required (`requireAuth`)
- **Request:** none
- **Success:** `200` `{ user: PublicUser, needsOnboarding: boolean }`; may carry a renewed cookie.
- **Errors:** `401` "Please sign in." — no cookie, malformed/expired/forged token, or the user row no longer exists. In the last two cases the cookie is also cleared.

### `POST /api/auth/logout`

- **Auth:** public and idempotent — signing out without a session is not an error.
- **Success:** `200` `{ status: "success", data: null }` with the cookie cleared.
- **Errors:** none beyond `500`.

### Logging

`info` on sign-in with `{ userId, isNewUser }`; `info` on logout with `{ userId }` when known; `warn` on rejected tokens with the failure reason only. **Never** the credential, the cookie, `email`, `name`, or the picture URL. `pino-http` does not log bodies; keep it that way.

## 5. Screens & components

### 5.1 Visual foundation (placeholder identity, approved 2026-10-01)

- **Accent:** purple (`#534AB7` light / a lighter purple in dark mode). Wordmark **BookRough** in Space Grotesk; body text Inter; warm off-white background.
- **Light and dark mode** follow the device setting (`prefers-color-scheme`).
- **Semantic tokens only.** `index.css` defines CSS variables — `bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `accent-contrast`, `danger` — exposed through Tailwind's `@theme`. Screens use these (`bg-surface`, `text-accent`) and **never raw palette classes** (`bg-purple-600`). A later redesign then changes one file. This rule is checked in every feature's Stage 3 review.
- **Shared primitives** in `components/ui/`: `Button`, `Wordmark`, `ScreenLayout` (+ the existing `Spinner` moves here). Anything used twice becomes a primitive.
- **Fonts are self-hosted** via `@fontsource`, not loaded from Google Fonts: the offline PWA (Phase 6) needs them in the bundle, and no request to Google happens before the user chooses to sign in.

### 5.2 Routes and guards

| Path          | Screen                              | Guard                                              |
| ------------- | ----------------------------------- | -------------------------------------------------- |
| `/`           | Welcome                             | Signed in → redirect to `/onboarding` or `/home`   |
| `/onboarding` | Complete Your Profile (placeholder) | Signed out → `/`; onboarding done → `/home`        |
| `/home`       | Home (placeholder dashboard)        | Signed out → `/`; needs onboarding → `/onboarding` |

On app load, the auth store is `unknown` and the app calls `GET /api/auth/me` once. While unknown, a full-screen spinner shows instead of any route — never a flash of Welcome for a signed-in user.

### 5.3 Welcome (`pages/Welcome.tsx`)

Phone layout (375 px), centred column: logo mark + **BookRough** wordmark; value line "Share music with friends, on whatever app they use."; a small illustration chip row ("Spotify link → Apple Music"); at the bottom, Google's button (`text="continue_with"`, `shape="pill"`, theme matching the colour scheme) and under it "No passwords. We never store your email." Touch targets ≥ 44 px.

- **Signing in:** once Google returns a credential, the button is replaced by a spinner and "Signing you in…" until the API answers. No double submission is possible.
- **Error — Google side** (popup failed): inline message "Google sign-in didn't complete. Please try again." and the button returns.
- **Error — server side** (`401`/`503`/network): inline message with the server's text, button returns. This request opts out of the global toast so the error is not shown twice.
- **Error — Google script blocked** (ad-blocker, offline): inline "Couldn't load Google sign-in. Check your connection or disable blockers for this site."
- **Offline** (`navigator.onLine === false`): inline "You're offline. Connect to sign in."
- **Empty state:** not applicable.

### 5.4 Placeholders (`pages/CompleteProfile.tsx`, `pages/Home.tsx`)

Both show the user's avatar (Google picture, or the generated initials avatar when `null` — for a user without a display name, a neutral glyph), one line of copy ("Profile setup comes next." / "You're signed in. Communities arrive in Phase 2."), and a **Sign out** button. Sign out shows a spinner on the button, calls logout, clears the store, and goes to `/`. They are replaced by the onboarding and dashboard features respectively.

### 5.5 Auth store (`stores/auth.ts`) and API client

- Zustand: `{ status: 'unknown' | 'signedIn' | 'signedOut', user: PublicUser | null, needsOnboarding: boolean }`, actions `setSession`, `clear`.
- `api/auth.ts`: `signInWithGoogle`, `fetchMe`, `logout`.
- `onUnauthorized()` in `api/client.ts` now clears the store instead of reloading the page; the route guards then navigate to `/` through the router. Same outcome as CLAUDE.md §4's "clear and redirect", without a full reload and a second `/auth/me`.
- The axios interceptor gains a per-request opt-out from the error toast (used by sign-in only).

## 6. Edge cases & failure modes

- **Abandoned onboarding.** User signs in, closes the app. Next sign-in matches the same `sub`, no second row, `needsOnboarding` still true, routed back to `/onboarding`.
- **Two simultaneous first sign-ins** (two tabs). Both try to create the same `google_sub`. The upsert's `P2002` is caught and the existing row is read instead; both tabs end up signed in to the same account.
- **User row deleted while a cookie is alive.** `/me` returns `401`, clears the cookie, the app shows Welcome.
- **Stolen cookie.** Valid until it expires (≤ 30 days of attacker inactivity, indefinitely while used). There is no per-session revoke; the remedy is rotating `JWT_SECRET`, which signs everyone out. Accepted for a small friend group; revisit if the audience grows.
- **Google picture missing or later 404s.** `profile_picture_url` is `null` or stale; the avatar component falls back to generated initials on image error.
- **Token for another app's client ID**, expired token, or forged token → `401`, no row created or touched.
- **Google key endpoint unreachable** → `503`, distinguishable from a bad token.
- **Malformed JSON body** → `400` (fixed in the error handler; today it falls through to `500`).
- **Form-encoded cross-site POST** to `/api/auth/google` (login CSRF): `express.json` ignores it, Zod rejects it with `422`.
- **iPhone PWA.** An app installed to the home screen has its own cookie jar, separate from Safari: the user signs in once inside it. Expected iOS behaviour, not a bug.
- **Network drops after Google succeeded but before the API answered:** the button returns with the offline message; retrying is safe because sign-in is idempotent.

## 7. Test scenarios

**Unit (services / utils)**

- ✅ `authenticateWithGoogle`: new `sub` creates a user with `profilePictureUrl` set and returns `needsOnboarding: true`.
- ✅ Known `sub` returns the same row, refreshes the picture, and creates nothing.
- ✅ Onboarded user (display name + service set) returns `needsOnboarding: false`.
- ✅ Concurrent-create `P2002` falls back to reading the existing row.
- ❌ Verifier throws (bad signature / audience / expiry) → `AppError 401`.
- ❌ Payload without `sub` → `AppError 401`.
- ❌ Key fetch fails → `AppError 503`.
- ✅/❌ `jwt.ts`: sign → verify round-trip; expired token rejected; token signed with another secret rejected; `shouldRenew` true after 15 days, false before.
- ✅ `toPublicUser` returns exactly the five public fields (key-set equality), so an added column cannot leak.

**Integration (endpoints)** — `google-auth-library` mocked

- ✅ `POST /auth/google` new user → `200`, cookie set with `HttpOnly` and `SameSite=Lax`, row exists.
- ✅ Same `sub` again → `200`, still one row.
- ❌ `400` body is not JSON.
- ❌ `422` missing `credential`; empty `credential`; extra key.
- ❌ `401` invalid token; wrong audience; expired.
- ❌ `503` Google keys unreachable.
- ✅ `GET /auth/me` with a valid cookie → `200` with `PublicUser`.
- ✅ `GET /auth/me` with a 16-day-old token → `200` and a renewed `Set-Cookie`.
- ❌ `401` no cookie; tampered token; expired token; user row deleted (cookie cleared).
- ✅ `POST /auth/logout` with a session → `200`, cookie cleared; without a session → `200`.
- 🔒 **Privacy regression:** the mocked token carries `email: "leak-check@example.com"` and `name: "Leak Check"`. After sign-in, assert neither string appears in the DB row, any response body, or any captured log line.
- (No `403` / `404` cases: none of these endpoints has a permission or a resource id.)

**Component (Vitest + RTL)** — `@react-oauth/google` mocked

- ✅ Welcome renders the wordmark, the value line, the Google button and the privacy line.
- ✅ Shows "Signing you in…" while the API call is pending.
- ✅ Routes to `/onboarding` when `needsOnboarding` is true, to `/home` when false.
- ❌ Google `onError` → inline Google error.
- ❌ API `401` → inline server error, no toast.
- ❌ Script load failure → inline blocked-script message.
- ✅ App shows the full-screen spinner while the session is `unknown`, never Welcome.
- ✅ Guards: signed-out visit to `/home` → `/`; needs-onboarding visit to `/home` → `/onboarding`; signed-in visit to `/` → redirected.
- ✅ Sign out on a placeholder clears the store and returns to `/`.

**E2E** — none in this feature. Former Step 1.7 covers sign-in → onboarding → home once onboarding exists.

## 8. Open questions & risks

- **Google popup inside an installed iPhone PWA.** Popup-mode Google sign-in is known to misbehave in iOS standalone web apps. It cannot be tested until Phase 6 installs the PWA. **Fallback, if it fails then:** switch `@react-oauth/google` to redirect mode, which needs one extra backend endpoint that receives Google's form POST. Recorded here so Phase 6 knows to test it first; not solved now.
- **Dependencies to add** (CLAUDE.md §11 requires approval; approving this spec approves these). Backend: `google-auth-library`, `jsonwebtoken`, `@types/jsonwebtoken`. Frontend: `zustand`, `@react-oauth/google` (all five already named in the documented stack), plus `@fontsource-variable/inter` and `@fontsource/space-grotesk` (new — recorded in `docs/tech stack.md` §5 per CLAUDE.md §18).
- **Developer action before manual testing:** create an OAuth 2.0 Client ID (type "Web application") in Google Cloud Console with `http://localhost:5173` as an authorised JavaScript origin, then put the ID in `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`). Automated tests do not need it.

## 9. Decisions log

| Date       | Decision                                                                                          | Reason                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-10-01 | Steps 1.1 + 1.3 + 1.5 merged into one feature                                                     | Vertical slicing (§11); neither 1.1 nor 1.3 alone ships anything clickable               |
| 2026-10-01 | Profile columns nullable; onboarding state derived from them                                      | The row is created at sign-in, before the user has chosen anything                       |
| 2026-10-01 | `preferred_service` has no default                                                                | "Not chosen" must differ from "chose Spotify"                                            |
| 2026-10-01 | `username` dropped; single `display_name` — any language, editable, unique via `display_name_key` | One name is simpler for users; uniqueness avoids look-alike friends; no handle is needed |
| 2026-10-01 | Google `name` claim discarded, like `email`                                                       | Google is used for identity only; everything shown is chosen by the user                 |
| 2026-10-01 | Session: 30 days, sliding renewal                                                                 | Re-signing into an iPhone PWA every few days is friction; inactivity still expires it    |
| 2026-10-01 | Column is `profile_picture_url` (CLAUDE.md's `avatar_url` corrected)                              | Three documents already used this name                                                   |
| 2026-10-01 | Placeholder identity: purple accent, Space Grotesk + Inter, semantic tokens                       | Real logo and design come later; tokens keep that redesign cheap                         |
| 2026-10-01 | Local Docker Postgres moved to host port 5433                                                     | A natively installed Postgres held 5432 and silently won every localhost connection      |
| 2026-10-01 | A 401 clears the store; guards redirect (no page reload)                                          | Router navigation is instant and avoids re-running the session bootstrap                 |
| 2026-10-01 | `GoogleOAuthProvider` wraps Welcome only                                                          | Google's script loads only when the sign-in button is actually on screen                 |
