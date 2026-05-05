# DEVELOPMENT.md — BookRough Step-by-Step Roadmap

This file is the live progress log for BookRough. The conventions, tech stack, and architectural rules live in [CLAUDE.md](CLAUDE.md) — read that first.

## How to use this file

- Steps are ordered. Do not skip ahead.
- Each step is a vertical slice that should ship as one feature branch / PR.
- **After completing a step**, fill in the `What I did` and `How to view & test` sections of that step in the same commit. This is mandated by [CLAUDE.md §13](CLAUDE.md#13--mandatory--update-developmentmd-after-every-step).
- Status legend: `☐ Not started` · `🟡 In progress` · `✅ Done`.

---

## Per-step template

```
### Step N — <title>  (Phase X — UC-?)
Status: ☐ Not started
Branch: feat/<kebab-name>

Goal: <one sentence>

Tasks:
- [ ] DB:       …
- [ ] Backend:  …
- [ ] Frontend: …
- [ ] Tests:    …

What I did: <FILL IN ON COMPLETION>
How to view & test: <FILL IN ON COMPLETION — exact commands, URLs, manual steps, test commands>
```

---

## Phase 0 — Local environment & shared infra

### Step 0.1 — Local Postgres + env files  (Phase 0)
Status: ✅ Done
Branch: chore/local-env-setup

Goal: A new contributor can start Postgres locally and boot both apps with copied `.env` files.

Tasks:
- [x] Infra:    `docker-compose.yml` at the repo root with a `postgres:16` service exposing 5432, named volume for data.
- [x] Backend:  `backend/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `PORT`, `NODE_ENV`.
- [x] Frontend: `frontend/.env.example` with `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`.
- [x] Docs:     README section "Local setup" with the four-line bring-up commands.

What I did: Created `docker-compose.yml` (postgres:16-alpine, port 5432, named volume `bookrough_pg_data`) and `infra/postgres-init/01-create-test-db.sql` which creates the `music_app_test_db` database on first boot. Added `backend/.env.example` and `frontend/.env.example` covering every required variable with inline comments. Note: local dev uses a pre-existing PostgreSQL 15 installation on port 5432 (the `bookrough` role and both databases were created manually via psql); Docker Compose is the documented path for fresh setups.
How to view & test: `docker compose up -d` (or use existing local Postgres), then `cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env` and fill in secrets. Postgres should be reachable at `localhost:5432`.

---

### Step 0.2 — Backend Express bootstrap  (Phase 0)
Status: ✅ Done
Branch: chore/backend-bootstrap

Goal: Express server boots, exposes `GET /api/health`, has the central error middleware and Pino logger wired in.

Tasks:
- [x] Backend:  `src/index.ts` Express bootstrap (cors, cookie-parser, json body, Pino HTTP logger).
- [x] Backend:  `src/utils/AppError.ts` and `src/middleware/errorHandler.ts`.
- [x] Backend:  `src/utils/response.ts` with `success(data)` / `failure(code, message)` helpers.
- [x] Backend:  `src/routes/health.ts` returning `{ status: "ok" }`.
- [x] Tests:    Supertest hitting `/api/health` and an intentionally-throwing test route to prove the error middleware shape.

What I did: Switched `backend/package.json` to `"type": "module"` (ESM). Created `src/config/env.ts` (Zod env validation, crashes on missing JWT_SECRET/DATABASE_URL), `src/utils/logger.ts` (Pino, pretty in dev), `src/utils/AppError.ts`, `src/utils/response.ts` (`ok()` / `fail()` helpers), `src/middleware/errorHandler.ts` (handles AppError + ZodError + unknowns, never leaks stacks), `src/middleware/notFound.ts`, `src/routes/health.ts`, `src/routes/index.ts` (hub router), `src/db/prisma.ts` (singleton PrismaClient via pg adapter), `src/app.ts` (`createApp()` factory), `src/index.ts` (entrypoint with graceful shutdown). Added Vitest + Supertest; wrote `src/app.test.ts` covering health + error middleware envelope shape.
How to view & test: `cd backend && npm run dev` → `curl http://localhost:4000/api/health` returns `{"status":"success","data":{"status":"ok",...}}`. `npm test` runs the Supertest suite (green).

---

### Step 0.3 — Frontend shell  (Phase 0)
Status: ✅ Done
Branch: chore/frontend-bootstrap

Goal: Vite app boots with React Router, Tailwind, axios client (with 401 interceptor + toast), and a root Error Boundary.

Tasks:
- [x] Frontend: `src/api/client.ts` axios instance + interceptor (401 → logout + redirect, 4xx/5xx → toast).
- [x] Frontend: Toast util (react-hot-toast mounted in main.tsx).
- [x] Frontend: Root `<ErrorBoundary>` wrapping the routed tree.
- [x] Frontend: React Router with placeholder routes for `/`, `/login`, `/signup`.
- [x] Tests:    RTL test that the Error Boundary renders fallback UI when a child throws.

What I did: Replaced Vite demo content with a real app shell. Replaced `index.css` with Tailwind directives. Rewrote `App.tsx` to render `<AppRoutes />`. Updated `main.tsx` to wrap the tree in `<BrowserRouter>`, `<GoogleOAuthProvider>`, `<ErrorBoundary>`, and `<Toaster>`. Created `src/api/client.ts` (axios instance with `VITE_API_BASE_URL ?? ""` fallback + `/api` prefix, `withCredentials: true`, response interceptor that toasts on 4xx/5xx and redirects on 401 with `skipAuthRedirect` escape hatch), `src/api/types.ts` (ApiSuccess/ApiError), `src/components/ErrorBoundary.tsx` (class component with Reload button), `src/router/AppRoutes.tsx` / `RequireAuth.tsx` / `RedirectIfAuthed.tsx` (stubs, filled out in Step 1.5), `src/pages/Welcome.tsx` + `NotFound.tsx`, `src/lib/cn.ts`, `src/test/setup.ts`, and `ErrorBoundary.test.tsx`.
How to view & test: `cd frontend && npm run dev` → open `http://localhost:5173` and see the Welcome page. `npm test` runs the RTL suite (green).

---

## Phase 1 — Foundation & Identity (UC-1, UC-2, UC-3, UC-17)

### Step 1.1 — Prisma users + password_resets schema  (Phase 1 — UC-1, UC-17)
Status: ✅ Done
Branch: feat/db-users-schema

Goal: First migration creates the `users` and `password_resets` tables exactly per `tables.docx`.

Tasks:
- [x] DB:       `prisma/schema.prisma` — `User` and `PasswordReset` models with all fields, enums (`PreferredService`), constraints from `tables.docx`.
- [x] DB:       `npx prisma migrate dev --name init_users` produces a clean migration.
- [x] Backend:  `src/db/prisma.ts` exporting a singleton PrismaClient.

What I did: Rewrote `prisma/schema.prisma` with the `PreferredService` enum (SPOTIFY, APPLE_MUSIC, YOUTUBE, TIDAL, DEEZER) and `User` model (id UUID, email unique, username unique, passwordHash nullable for Google-only users, displayName, profilePictureUrl, preferredService, profileComplete boolean, createdAt) plus `PasswordReset` model (id UUID, userId FK cascade-delete, token unique, expiresAt, createdAt). Used Prisma 7's `prisma.config.ts` pattern with `pg.Pool` + `@prisma/adapter-pg` for the runtime adapter. Ran `prisma migrate dev --name init_users` against the local Postgres to produce the first migration SQL. The `bookrough` role needed `CREATEDB` privilege for the shadow database (`ALTER ROLE bookrough CREATEDB;`).
How to view & test: `cd backend && npx prisma migrate dev` should report "Database already up to date." `npx prisma studio` opens a GUI on port 5555 showing the empty `users` and `password_resets` tables.

---

### Step 1.2 — Email/password auth routes  (Phase 1 — UC-1, UC-2, UC-3)
Status: ✅ Done
Branch: feat/auth-email-password

Goal: A user can register, log in, log out, and fetch their session via email + password.

Tasks:
- [x] Backend:  `POST /api/auth/register` (Zod validation, bcrypt hash, conflict → 400 "Email already exists").
- [x] Backend:  `POST /api/auth/login` (verify hash, issue JWT in HttpOnly cookie).
- [x] Backend:  `POST /api/auth/logout` (clear cookie).
- [x] Backend:  `GET /api/auth/me` (auth middleware that reads cookie, returns current user).
- [x] Backend:  `src/utils/jwt.ts` sign/verify helpers.
- [x] Tests:    Supertest integration tests for each route (success + failure paths).

What I did: Created `src/utils/jwt.ts` (`signSession`/`verifySession` wrappers over jsonwebtoken, 7-day lifetime), `src/utils/cookies.ts` (`setSessionCookie`/`clearSessionCookie`, HttpOnly + SameSite=Lax in dev, Secure in prod; cookie name `bookrough_session`), `src/types/express.d.ts` (module augmentation so `req.user` is typed), `src/middleware/requireAuth.ts` (reads cookie → verifies JWT → attaches `req.user` or throws AppError 401), `src/validation/auth.schema.ts` (Zod: registerSchema with email, username 3–20 chars, displayName 1–50, password ≥8 with letter+digit; loginSchema), `src/services/auth.service.ts` (bcrypt cost 12; catches P2002 → AppError 400 for duplicate email/username; `SafeUser` type omits passwordHash), `src/controllers/auth.controller.ts`, `src/routes/auth.ts` (POST /register /login /logout; GET /me). Added `src/test/db.ts` (truncates all tables in FK-safe order for `beforeEach`). Set `fileParallelism: false` in vitest.config.ts to prevent DB race conditions across test files. Integration test suite: `src/routes/auth.test.ts` (10 tests covering all happy + failure paths).
How to view & test: `cd backend && npm test` → all tests green. Manual: `curl -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"email":"a@b.com","username":"alice","displayName":"Alice","password":"pass1234","preferredService":"SPOTIFY"}'` returns 201 with the user object (no passwordHash).

---

### Step 1.3 — Google OAuth route  (Phase 1 — UC-1, UC-2)
Status: ✅ Done
Branch: feat/auth-google-oauth

Goal: `POST /api/auth/google` accepts a Google identity token, verifies it server-side, finds-or-creates the user, returns the app JWT.

Tasks:
- [x] Backend:  `POST /api/auth/google` using `google-auth-library` `OAuth2Client.verifyIdToken`.
- [x] Backend:  Find-or-create: existing email reuses the row (account collision handling); new user is created with `password_hash = null` and a flag indicating profile is incomplete.
- [x] Tests:    Integration test mocking `google-auth-library` to return a fake verified payload; assert user row, cookie, and 401 on invalid token.

What I did: Created `src/services/google.service.ts` (`verifyGoogleIdToken` wraps `OAuth2Client.verifyIdToken`, throws `AppError(401)` on failure — centralised so tests mock one module). Extended `auth.service.ts` with `loginOrCreateGoogleUser`: finds user by email or creates one with `passwordHash: null`, `profileComplete: false`, derived `displayName` and a generated `username` (lowercased display name + 4-digit suffix, retries on P2002 collision up to 5 times). Extended `auth.controller.ts` with `googleLogin` handler (returns `{ user, requiresOnboarding: !user.profileComplete }`), added `googleLoginSchema` to `auth.schema.ts`, and wired `POST /google` in `auth.ts`. Integration test suite: `src/routes/auth.google.test.ts` (4 tests, mocks `google.service.js` to run offline).
How to view & test: `cd backend && npm test` → all tests green. In a real browser flow, the Google credential from `@react-oauth/google` is posted to `POST /api/auth/google` and a session cookie is set.

---

### Step 1.4 — Forgot-password flow  (Phase 1 — UC-17)
Status: ✅ Done
Branch: feat/auth-password-reset

Goal: A user can request a password reset email and set a new password via a time-limited token.

Tasks:
- [x] Backend:  `POST /api/auth/forgot` — accepts email, creates a `password_resets` row with `expires_at = now + 1h`, always responds with the same generic 200 (prevents enumeration).
- [x] Backend:  `POST /api/auth/reset` — accepts `{ token, newPassword }`, validates expiry, updates `password_hash`, deletes used token.
- [x] Backend:  Google-only accounts silently no-op (no token row created, same generic response returned).
- [x] Tests:    Integration tests for happy path, expired token, Google-only email, unknown email.

What I did: Created `src/services/passwordReset.service.ts` (`requestReset` generates `crypto.randomBytes(32).toString("hex")` token, sets `expiresAt = now + 1h`, silently skips unknown emails and Google-only accounts; `resetWithToken` validates expiry, updates passwordHash, and deletes the token atomically in a Prisma transaction — throws `AppError(400)` on invalid/expired token). Created `src/services/email.service.ts` stub (`sendPasswordResetEmail` logs the reset URL via Pino; real provider wired here later). Extended `auth.controller.ts`, `auth.schema.ts`, and `auth.ts` routes. Integration test suite: `src/routes/auth.reset.test.ts` (8 tests covering all branches including token burning to prevent reuse and expiry validation).
How to view & test: `cd backend && npm test` → all tests green. Manual: POST to `/api/auth/forgot` with any email always returns the same JSON. The reset link is logged to the backend console in dev.

---

### Step 1.5 — Auth UI screens  (Phase 1 — UC-1, UC-2, UC-3, UC-17)
Status: ✅ Done
Branch: feat/auth-ui

Goal: Welcome / Register / Login / Forgot Password / Create New Password screens are built and wired to the backend. Google login button works end-to-end.

Tasks:
- [x] Frontend: `<GoogleOAuthProvider>` wrap at app root using `VITE_GOOGLE_CLIENT_ID`.
- [x] Frontend: `pages/Welcome.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `CreateNewPassword.tsx`.
- [x] Frontend: `stores/authStore.ts` Zustand store (user, status: loading|authed|guest, hydrate, setUser, logout).
- [x] Frontend: Route guards — unauthenticated users hitting protected routes are redirected to `/login`.

What I did: Created `src/stores/authStore.ts` (Zustand; `hydrate()` calls `GET /api/auth/me` with `skipAuthRedirect: true` to avoid interceptor loop; `logout()` calls the API then clears state). Created `src/api/auth.ts` (typed wrappers for all auth endpoints). Created `src/types/user.ts`. Built reusable UI primitives: `src/components/ui/Button.tsx` (primary/secondary/ghost variants, loading spinner), `src/components/ui/Input.tsx` (labeled, forwardRef, red border on error), `src/components/AuthLayout.tsx` (centered card). Created `src/components/GoogleSignInButton.tsx` (wraps `@react-oauth/google`, posts credential to backend, navigates to `/onboarding` or `/dashboard`). Implemented all five screens. Wired `RequireAuth.tsx` (checks authStore; loading → spinner; guest → `/login`; incomplete profile → `/onboarding`) and `RedirectIfAuthed.tsx` (authed → `/dashboard`). Updated `AppRoutes.tsx` to wrap public routes in `<RedirectIfAuthed>` and protected routes in `<RequireAuth>`. Added `hydrate()` call in `main.tsx`. Key fix: axios baseURL falls back to `""` when `VITE_API_BASE_URL` is unset (allowing Vite dev proxy at `/api`). Fixed hydrate data path to `res.data.data.user` (the envelope nests `{ data: { user } }`).
How to view & test: Boot both servers. Visit `http://localhost:5173` — Welcome page renders. Click "Log In" → Login page. Register a new account → redirected to Dashboard. Refresh → stays on Dashboard (session hydrated). Log out → redirected to Welcome. Visiting `/dashboard` while logged out redirects to `/login`.

---

### Step 1.6 — Complete-Your-Profile onboarding  (Phase 1 — UC-1)
Status: ✅ Done
Branch: feat/auth-google-onboarding

Goal: A new Google user is forced through a profile completion screen before reaching the dashboard.

Tasks:
- [x] Backend:  `PATCH /api/users/me/onboarding` — accepts `{ username, preferredService }`, marks the user as complete.
- [x] Frontend: `pages/Onboarding.tsx` with username + `preferredService` selector.
- [x] Frontend: Auth guard pushes Google-created users with incomplete profiles to this screen on every navigation.
- [x] Tests:    Integration tests for the route (success, duplicate username 400, no auth 401, invalid service 400).

What I did: Backend — created `src/services/user.service.ts` (`completeOnboarding` updates username + preferredService + sets profileComplete=true, catches P2002 → AppError 400 "Username taken"), `src/validation/user.schema.ts` (`onboardingSchema` reuses the same username rules as register), `src/controllers/user.controller.ts` (`patchOnboarding` handler), `src/routes/users.ts` (`PATCH /me/onboarding` with requireAuth middleware), mounted in `routes/index.ts` at `/users`. Integration test suite: `src/routes/users.onboarding.test.ts` (4 tests). Frontend — created `src/api/users.ts` (`completeOnboarding` wrapper for the PATCH endpoint) and `src/pages/Onboarding.tsx` (username input with inline validation + preferredService select, on success calls `setUser` and navigates to `/dashboard`). Updated `AppRoutes.tsx` to add `/onboarding` route inside `<RequireAuth>`. The `RequireAuth` guard already redirects users with `profileComplete === false` to `/onboarding` automatically.
How to view & test: Sign in with Google using a new account → redirected to `/onboarding`. Fill in username + streaming service → Submit → redirected to `/dashboard`. Attempting to navigate to `/dashboard` as an incomplete user brings you back to `/onboarding`. `cd backend && npm test` → 31 tests green across 6 files.

---

### Step 1.7 — Phase 1 E2E coverage  (Phase 1)
Status: ✅ Done
Branch: test/auth-e2e

Goal: A Playwright E2E spec runs the full register → logout → login loop against a local stack.

Tasks:
- [x] Tests:    `e2e/tests/auth.spec.ts` — register a new user, verify dashboard, log out, log back in (3 specs).
- [x] Tests:    `e2e/utils/db.ts` — `resetDatabase()` truncates the test DB before each spec via a direct pg.Pool connection.

What I did: Created an isolated `e2e/` package with `@playwright/test` as its only test dependency. `playwright.config.ts` starts the backend (pointed at `music_app_test_db`) and frontend dev servers automatically via `webServer`, so a single `npm test` in `e2e/` drives the full stack. Three specs cover: (1) register → dashboard → logout → login again; (2) guest visiting `/dashboard` is redirected to `/login`; (3) authed user visiting `/login` is bounced to `/dashboard`. The test DB is truncated before each spec using a direct pg connection. Note: the E2E suite is **not yet in CI** (added in Step 6.1); run it locally only.
How to view & test: With Postgres running and backend `.env` set: `cd e2e && npm install && npx playwright install chromium && cp .env.example .env && npm test`. Playwright starts both servers, runs the specs, and shuts down. Full results appear in the terminal. Use `npm run test:headed` to watch the browser.

---

## Phase 2 — Core Social Structures (UC-4, UC-9, UC-10, UC-14, UC-15)

### Step 2.1 — Communities schema  (Phase 2 — UC-9)
Status: ☐ Not started
Branch: feat/db-communities-schema

Goal: Migration adds `communities` and `community_members` tables (composite PK on members, role enum).

Tasks:
- [ ] DB:       Add models per `tables.docx`.
- [ ] DB:       Migration `add_communities`.

What I did:
How to view & test:

---

### Step 2.2 — Community CRUD + invite tokens  (Phase 2 — UC-9, UC-15)
Status: ☐ Not started
Branch: feat/communities-crud

Goal: Authenticated users can create, read, update, and delete communities; admins can mint invite links.

Tasks:
- [ ] Backend:  `POST /api/communities`, `GET /api/communities/:id`, `PATCH /api/communities/:id`, `DELETE /api/communities/:id` (admin-only on the latter two).
- [ ] Backend:  `POST /api/communities/:id/invite` mints/rotates `invite_token`; `GET /api/invites/:token` returns a preview payload (community name, cover image, member count).
- [ ] Tests:    Integration tests for permissions and invite-token validity.

What I did:
How to view & test:

---

### Step 2.3 — Membership management  (Phase 2 — UC-10, UC-14, UC-15)
Status: ☐ Not started
Branch: feat/community-membership

Goal: Users can join via invite token and leave; admins can kick members.

Tasks:
- [ ] Backend:  `POST /api/invites/:token/accept` joins the community.
- [ ] Backend:  `DELETE /api/communities/:id/members/me` (leave); block if user is sole admin → 400 with the docs message.
- [ ] Backend:  `DELETE /api/communities/:id/members/:userId` (kick); block kicking another admin.
- [ ] Tests:    Integration tests for sole-admin block and kick-admin block.

What I did:
How to view & test:

---

### Step 2.4 — Edit profile  (Phase 2 — UC-4)
Status: ☐ Not started
Branch: feat/profile-edit

Goal: Users can update display name, avatar, and preferred streaming service.

Tasks:
- [ ] Backend:  `PATCH /api/users/me` with image-size validation (≤5 MB, supported MIME types per UC-4 fail path).
- [ ] Backend:  Avatar upload strategy decided and documented (e.g. local disk in dev, signed S3 URL noted as TODO).
- [ ] Tests:    Integration tests for happy path + oversized image rejection.

What I did:
How to view & test:

---

### Step 2.5 — Community + profile UI  (Phase 2 — UC-4, UC-9, UC-10, UC-14)
Status: ☐ Not started
Branch: feat/communities-ui

Goal: Communities Dashboard, Create Community modal, Community Settings & Members, and My Profile / Settings screens are functional.

Tasks:
- [ ] Frontend: `pages/Dashboard.tsx` listing joined communities with cover art, FAB for "Create Community".
- [ ] Frontend: `components/CreateCommunityModal.tsx`.
- [ ] Frontend: `pages/CommunitySettings.tsx` with members list, kick action for admins, leave button.
- [ ] Frontend: `pages/MyProfile.tsx` with edit form and visible Logout.
- [ ] Tests:    RTL test on the create form's required-name validation.

What I did:
How to view & test:

---

### Step 2.6 — Invite deep links  (Phase 2 — UC-15)
Status: ☐ Not started
Branch: feat/invite-deep-links

Goal: A user clicking an invite URL lands on a "Join Community" preview screen and can join with one tap.

Tasks:
- [ ] Frontend: Route `/invite/:token` rendering `pages/InvitePreview.tsx` (community name, cover, member count, Join button).
- [ ] Frontend: Unauthenticated users hitting an invite URL are sent through login first, then back to the preview.
- [ ] Frontend: Expired/invalid token → error state per UC-15 fail path.
- [ ] Tests:    RTL test for the three states (valid / expired / not logged in).

What I did:
How to view & test:

---

### Step 2.7 — Phase 2 test coverage  (Phase 2)
Status: ☐ Not started
Branch: test/communities

Goal: All Phase 2 routes have integration tests; create-community form has RTL coverage.

Tasks:
- [ ] Tests:    Backfill any missing integration tests from steps 2.2–2.4.
- [ ] Tests:    Run `npm test` clean across both apps.

What I did:
How to view & test:

---

## Phase 3 — The Magic Feature (UC-11, UC-18 + Playwright)

### Step 3.1 — Posts schema  (Phase 3 — UC-11)
Status: ☐ Not started
Branch: feat/db-posts-schema

Goal: Migration adds `posts` table with original_url, song metadata fields, and the per-platform universal links.

Tasks:
- [ ] DB:       Add `Post` model per `tables.docx`, including a `conversionPending` boolean for graceful failure.
- [ ] DB:       Migration `add_posts`.

What I did:
How to view & test:

---

### Step 3.2 — Playwright link scraper service  (Phase 3 — UC-11)
Status: ☐ Not started
Branch: feat/link-scraper-service

Goal: `services/linkScraper.service.ts` returns `UniversalLinks` for a given source URL using headless Chromium.

Tasks:
- [ ] Backend:  `npm install playwright` + `npx playwright install chromium`.
- [ ] Backend:  Implement `generateUniversalLinks(sourceUrl)` per `link converter implementation guide.docx`: launch flags, resource blocking, 8s `waitForSelector`, browser cleanup in `finally`.
- [ ] Backend:  Document the **TODO** about replacing placeholder selectors with real squigly.link selectors after manual DevTools inspection.
- [ ] Tests:    Unit test with Playwright mocked at module level — the function returns the mapped object given a fake `page.evaluate` result.

What I did:
How to view & test:

---

### Step 3.3 — Post-creation route  (Phase 3 — UC-11)
Status: ☐ Not started
Branch: feat/post-create

Goal: `POST /api/communities/:id/posts` creates a post, calling the scraper and persisting both metadata and per-platform links. On scraper failure, post is still saved with `conversionPending = true`.

Tasks:
- [ ] Backend:  Controller validates `{ url, comment }` with Zod; service composes scraper output + DB write.
- [ ] Backend:  Membership guard — only members of the community can post.
- [ ] Tests:    Integration test mocking the scraper for both success and failure; assert DB row in both cases.

What I did:
How to view & test:

---

### Step 3.4 — Backend Dockerfile  (Phase 3)
Status: ☐ Not started
Branch: chore/backend-dockerfile

Goal: `backend/Dockerfile` based on `mcr.microsoft.com/playwright` builds and runs the API with Chromium available.

Tasks:
- [ ] Infra:    Dockerfile per the conversion guide (copy, install, build, expose, start).
- [ ] Infra:    Smoke-test by building the image and running the container; healthcheck responds.

What I did:
How to view & test:

---

### Step 3.5 — Delete post  (Phase 3 — UC-18)
Status: ☐ Not started
Branch: feat/post-delete

Goal: The original author can delete their post; ratings cascade-delete with it.

Tasks:
- [ ] Backend:  `DELETE /api/posts/:id` — author-only, cascade configured in Prisma schema.
- [ ] Tests:    Integration tests for author success, non-author 403, cascade verified.

What I did:
How to view & test:

---

### Step 3.6 — Community Feed UI  (Phase 3 — UC-11, UC-18)
Status: ☐ Not started
Branch: feat/community-feed-ui

Goal: The Community Feed renders posts with cover art, paste-link input, and a per-post context menu with "Delete" for the author.

Tasks:
- [ ] Frontend: `pages/CommunityFeed.tsx` with paste-link input, optional comment, submit.
- [ ] Frontend: `components/PostCard.tsx` showing cover art, title, artist, the link routed to the **viewer's** preferred service, a bookmark icon stub (active in Phase 4), and the author context menu.
- [ ] Frontend: Loading state while the scraper runs ("Converting link…") + graceful error toast.
- [ ] Tests:    RTL on PostCard: author sees Delete, non-author does not.

What I did:
How to view & test:

---

### Step 3.7 — Phase 3 E2E coverage  (Phase 3)
Status: ☐ Not started
Branch: test/post-flow-e2e

Goal: Playwright E2E covers the full paste-a-link-and-see-it-rendered loop.

Tasks:
- [ ] Tests:    E2E: log in, open a community, paste a Spotify link (use a known stable URL), assert the post appears with title/artist.
- [ ] Tests:    Document how the test handles squigly.link being live (skip with `test.skip` if `RUN_LIVE_E2E !== '1'`).

What I did:
How to view & test:

---

## Phase 4 — Engagement & Feedback (UC-12, UC-13, UC-16)

### Step 4.1 — Ratings + bookmarks schema  (Phase 4)
Status: ☐ Not started
Branch: feat/db-ratings-bookmarks-schema

Goal: Migration adds `ratings` (unique on `(post_id, user_id)`) and `bookmarks` (composite PK) tables.

Tasks:
- [ ] DB:       Add `Rating` and `Bookmark` models per `tables.docx`.
- [ ] DB:       Migration `add_ratings_bookmarks`.

What I did:
How to view & test:

---

### Step 4.2 — Bookmark + rating routes  (Phase 4 — UC-12, UC-13)
Status: ☐ Not started
Branch: feat/ratings-bookmarks-api

Goal: Users can bookmark/unbookmark posts and submit a 1–10 rating with optional comment.

Tasks:
- [ ] Backend:  `POST /api/posts/:id/bookmark` + `DELETE /api/posts/:id/bookmark`.
- [ ] Backend:  `POST /api/posts/:id/ratings` (unique-per-user enforced; on submit, remove from bookmarks if present).
- [ ] Backend:  `GET /api/posts/:id/ratings` returns reviews + average for UC-16.
- [ ] Backend:  `GET /api/users/me/bookmarks` for the My List screen.
- [ ] Tests:    Integration tests for unique-rating constraint and bookmark removal on rate.

What I did:
How to view & test:

---

### Step 4.3 — Notification stub on rating  (Phase 4 — UC-13)
Status: ☐ Not started
Branch: feat/rating-notification-stub

Goal: When a rating is submitted, a stub notification is emitted to the post author (logged via Pino now, real channel later).

Tasks:
- [ ] Backend:  Service-layer hook after rating insert that logs `INFO` with `{ authorId, raterId, score }`.
- [ ] Backend:  Note in the code where the real notification channel will plug in (no implementation).

What I did:
How to view & test:

---

### Step 4.4 — Engagement UI  (Phase 4 — UC-12, UC-13, UC-16)
Status: ☐ Not started
Branch: feat/engagement-ui

Goal: Bookmark icon, My List screen, Submit Rating modal, and Post Detail / Feedback screen are all live.

Tasks:
- [ ] Frontend: Activate the bookmark icon on `PostCard` (filled / outline state, optimistic update with rollback on error per UC-12 fail path).
- [ ] Frontend: `pages/MyList.tsx` listing bookmarked posts with a "Rate & Review" CTA.
- [ ] Frontend: `components/RatingModal.tsx` with 1–10 star control + optional comment.
- [ ] Frontend: `pages/PostDetail.tsx` with average rating prominently and a list of individual reviews.
- [ ] Frontend: Stale bookmark handling (UC-13 fail path: post deleted → drop the ghost row + toast).

What I did:
How to view & test:

---

### Step 4.5 — Phase 4 test coverage  (Phase 4)
Status: ☐ Not started
Branch: test/engagement

Goal: Routes have integration tests, star control has RTL coverage.

Tasks:
- [ ] Tests:    RTL on the star control: clicking 7 reports score 7.
- [ ] Tests:    Integration: full rate-then-fetch-feedback loop returns the new average.

What I did:
How to view & test:

---

## Phase 5 — Social Discovery (UC-5, UC-6, UC-7, UC-8)

### Step 5.1 — Friends schema  (Phase 5)
Status: ☐ Not started
Branch: feat/db-friends-schema

Goal: Migration adds the `friends` table with the `(requester_id, addressee_id)` composite PK and `status` enum.

Tasks:
- [ ] DB:       Add `Friend` model + migration.
- [ ] DB:       Application-level guard that prevents reverse-direction duplicates per `tables.docx`.

What I did:
How to view & test:

---

### Step 5.2 — Search + friend routes  (Phase 5 — UC-5, UC-6, UC-7, UC-8)
Status: ☐ Not started
Branch: feat/friends-api

Goal: APIs cover global user search, sending requests, accept/ignore, and unfriending.

Tasks:
- [ ] Backend:  `GET /api/users?q=` partial match on `username` + `display_name`.
- [ ] Backend:  `POST /api/friends/requests` (creates PENDING).
- [ ] Backend:  `POST /api/friends/requests/:id/accept` and `.../ignore`.
- [ ] Backend:  `DELETE /api/friends/:userId` (unfriend).
- [ ] Tests:    Integration: lifecycle from request → accept → unfriend; ghost-request handling per UC-7 fail path.

What I did:
How to view & test:

---

### Step 5.3 — Discovery UI  (Phase 5 — UC-5, UC-6, UC-7, UC-8)
Status: ☐ Not started
Branch: feat/friends-ui

Goal: Global search bar, public profile screen, and Friends & Requests tab work end-to-end.

Tasks:
- [ ] Frontend: `pages/Search.tsx` global search results.
- [ ] Frontend: `pages/PublicProfile.tsx` with dynamic Add Friend / Pending / Friends / blocked-or-hidden states per UC-6.
- [ ] Frontend: `pages/Friends.tsx` with My Friends + Pending Requests tabs.
- [ ] Tests:    RTL on the dynamic friend button rendering for each state.

What I did:
How to view & test:

---

### Step 5.4 — Phase 5 test coverage  (Phase 5)
Status: ☐ Not started
Branch: test/friends

Goal: Friend lifecycle covered by integration + a single happy-path E2E.

Tasks:
- [ ] Tests:    E2E: two users, one sends a request, the other accepts.

What I did:
How to view & test:

---

## Phase 6 — Hardening

### Step 6.1 — GitHub Actions CI  (Phase 6)
Status: ☐ Not started
Branch: chore/github-actions-ci

Goal: Every PR runs lint, typecheck, and tests for both apps; merge blocked on red.

Tasks:
- [ ] Infra:    `.github/workflows/ci.yml` with two jobs (backend, frontend), Postgres service for backend integration tests.
- [ ] Infra:    Branch protection rule on `main` requiring the CI check.

What I did:
How to view & test:

---

### Step 6.2 — Production docker-compose  (Phase 6)
Status: ☐ Not started
Branch: chore/prod-compose

Goal: A `docker-compose.prod.yml` brings up backend (Playwright image) + Postgres + a static frontend container.

Tasks:
- [ ] Infra:    Compose file + sample `.env.prod.example`.
- [ ] Infra:    Document the bring-up sequence in the README.

What I did:
How to view & test:

---

### Step 6.3 — README polish + deployment notes  (Phase 6)
Status: ☐ Not started
Branch: docs/readme-deploy

Goal: README explains what BookRough is, how to develop locally, and how to deploy.

Tasks:
- [ ] Docs:     Rewrite README sections: Overview, Local dev, Tests, Deployment, Contributing (links back to CLAUDE.md).

What I did:
How to view & test:
