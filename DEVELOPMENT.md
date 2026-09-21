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
Status: ☐ Not started
Branch: chore/local-env-setup

Goal: A new contributor can start Postgres locally and boot both apps with copied `.env` files.

Tasks:
- [x] Infra:    `docker-compose.yml` at the repo root with a `postgres:16` service exposing 5432, named volume for data.
- [x] Backend:  `backend/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `PORT`, `NODE_ENV`.
- [x] Frontend: `frontend/.env.example` with `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`.
- [x] Docs:     README section "Local setup" with the four-line bring-up commands.

What I did:
How to view & test:

---

### Step 0.2 — Backend Express bootstrap  (Phase 0)
Status: ☐ Not started
Branch: chore/backend-bootstrap

Goal: Express server boots, exposes `GET /api/health`, has the central error middleware and Pino logger wired in.

Tasks:
- [x] Backend:  `src/index.ts` Express bootstrap (cors, cookie-parser, json body, Pino HTTP logger).
- [x] Backend:  `src/utils/AppError.ts` and `src/middleware/errorHandler.ts`.
- [x] Backend:  `src/utils/response.ts` with `success(data)` / `failure(code, message)` helpers.
- [x] Backend:  `src/routes/health.ts` returning `{ status: "ok" }`.
- [x] Tests:    Supertest hitting `/api/health` and an intentionally-throwing test route to prove the error middleware shape.

What I did:
How to view & test:

---

### Step 0.3 — Frontend shell  (Phase 0)
Status: ☐ Not started
Branch: chore/frontend-bootstrap

Goal: Vite app boots with React Router, Tailwind, axios client (with 401 interceptor + toast), and a root Error Boundary.

Tasks:
- [x] Frontend: `src/api/client.ts` axios instance + interceptor (401 → logout + redirect, 4xx/5xx → toast).
- [x] Frontend: Toast util (react-hot-toast mounted in main.tsx).
- [x] Frontend: Root `<ErrorBoundary>` wrapping the routed tree.
- [x] Frontend: React Router with placeholder routes for `/`, `/login`, `/signup`.
- [x] Tests:    RTL test that the Error Boundary renders fallback UI when a child throws.

What I did:
How to view & test:

---

## Phase 1 — Foundation & Identity (UC-1, UC-2, UC-3, UC-17)

### Step 1.1 — Prisma users + password_resets schema  (Phase 1 — UC-1, UC-17)
Status: ☐ Not started
Branch: feat/db-users-schema

Goal: First migration creates the `users` and `password_resets` tables exactly per `tables.docx`.

Tasks:
- [x] DB:       `prisma/schema.prisma` — `User` and `PasswordReset` models with all fields, enums (`PreferredService`), constraints from `tables.docx`.
- [x] DB:       `npx prisma migrate dev --name init_users` produces a clean migration.
- [x] Backend:  `src/db/prisma.ts` exporting a singleton PrismaClient.

What I did:
How to view & test:

---

### Step 1.2 — Email/password auth routes  (Phase 1 — UC-1, UC-2, UC-3)
Status: ☐ Not started
Branch: feat/auth-email-password

Goal: A user can register, log in, log out, and fetch their session via email + password.

Tasks:
- [x] Backend:  `POST /api/auth/register` (Zod validation, bcrypt hash, conflict → 400 "Email already exists").
- [x] Backend:  `POST /api/auth/login` (verify hash, issue JWT in HttpOnly cookie).
- [x] Backend:  `POST /api/auth/logout` (clear cookie).
- [x] Backend:  `GET /api/auth/me` (auth middleware that reads cookie, returns current user).
- [x] Backend:  `src/utils/jwt.ts` sign/verify helpers.
- [x] Tests:    Supertest integration tests for each route (success + failure paths).

What I did:
How to view & test:

---

### Step 1.3 — Google OAuth route  (Phase 1 — UC-1, UC-2)
Status: ☐ Not started
Branch: feat/auth-google-oauth

Goal: `POST /api/auth/google` accepts a Google identity token, verifies it server-side, finds-or-creates the user, returns the app JWT.

Tasks:
- [x] Backend:  `POST /api/auth/google` using `google-auth-library` `OAuth2Client.verifyIdToken`.
- [x] Backend:  Find-or-create: existing email reuses the row (account collision handling); new user is created with `password_hash = null` and a flag indicating profile is incomplete.
- [x] Tests:    Integration test mocking `google-auth-library` to return a fake verified payload; assert user row, cookie, and 401 on invalid token.

What I did:
How to view & test:

---

### Step 1.4 — Forgot-password flow  (Phase 1 — UC-17)
Status: ☐ Not started
Branch: feat/auth-password-reset

Goal: A user can request a password reset email and set a new password via a time-limited token.

Tasks:
- [x] Backend:  `POST /api/auth/forgot` — accepts email, creates a `password_resets` row with `expires_at = now + 1h`, always responds with the same generic 200 (prevents enumeration).
- [x] Backend:  `POST /api/auth/reset` — accepts `{ token, newPassword }`, validates expiry, updates `password_hash`, deletes used token.
- [x] Backend:  Google-only accounts silently no-op (no token row created, same generic response returned).
- [x] Tests:    Integration tests for happy path, expired token, Google-only email, unknown email.

What I did:
How to view & test:

---

### Step 1.5 — Auth UI screens  (Phase 1 — UC-1, UC-2, UC-3, UC-17)
Status: ☐ Not started
Branch: feat/auth-ui

Goal: Welcome / Register / Login / Forgot Password / Create New Password screens are built and wired to the backend. Google login button works end-to-end.

Tasks:
- [x] Frontend: `<GoogleOAuthProvider>` wrap at app root using `VITE_GOOGLE_CLIENT_ID`.
- [x] Frontend: `pages/Welcome.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `CreateNewPassword.tsx`.
- [x] Frontend: `stores/authStore.ts` Zustand store (user, status: loading|authed|guest, hydrate, setUser, logout).
- [x] Frontend: Route guards — unauthenticated users hitting protected routes are redirected to `/login`.

What I did:
How to view & test:

---

### Step 1.6 — Complete-Your-Profile onboarding  (Phase 1 — UC-1)
Status: ☐ Not started
Branch: feat/auth-google-onboarding

Goal: A new Google user is forced through a profile completion screen before reaching the dashboard.

Tasks:
- [x] Backend:  `PATCH /api/users/me/onboarding` — accepts `{ username, preferredService }`, marks the user as complete.
- [x] Frontend: `pages/Onboarding.tsx` with username + `preferredService` selector.
- [x] Frontend: Auth guard pushes Google-created users with incomplete profiles to this screen on every navigation.
- [x] Tests:    Integration tests for the route (success, duplicate username 400, no auth 401, invalid service 400).

What I did:
How to view & test:

---

### Step 1.7 — Phase 1 E2E coverage  (Phase 1)
Status: ☐ Not started
Branch: test/auth-e2e

Goal: A Playwright E2E spec runs the full register → logout → login loop against a local stack.

Tasks:
- [x] Tests:    `e2e/tests/auth.spec.ts` — register a new user, verify dashboard, log out, log back in (3 specs).
- [x] Tests:    `e2e/utils/db.ts` — `resetDatabase()` truncates the test DB before each spec via a direct pg.Pool connection.

What I did:
How to view & test:

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
