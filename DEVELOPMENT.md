# DEVELOPMENT.md — BookRough Step-by-Step Roadmap

This file is the live progress log for BookRough. The conventions, tech stack, and architectural rules live in [CLAUDE.md](CLAUDE.md) — read that first.

## How to use this file

- Steps are ordered. Do not skip ahead.
- Each step is a vertical slice that should ship as one feature branch / PR.
- **After completing a step**, fill in the `What I did` and `How to view & test` sections of that step in the same commit. This is mandated by [CLAUDE.md §13](CLAUDE.md#13--mandatory--update-developmentmd-after-every-step).
- Status legend: `☐ Not started` · `🟡 In progress` · `✅ Done`.

### Every step runs as a four-stage feature session

Defined in full in [CLAUDE.md §15](CLAUDE.md). No step begins at the code.

| Stage                       | Output                                                                           | Gate                                  |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| **1. Specification**        | `docs/features/<name>.md` from `docs/features/_TEMPLATE.md`                      | **Developer approves before Stage 2** |
| **2. Implementation**       | The whole vertical slice, DB → API → UI                                          | —                                     |
| **3. Review & improvement** | Naming, duplication, error handling, missing states — fixed _before_ tests exist | —                                     |
| **4. Tests**                | Every good path and every bad path named in the spec                             | Suite green, coverage ≥ 80%           |

Only then: update this file, commit, push, open the PR. **Claude runs every git command; the developer reviews the diff and clicks Merge.**

One step at a time — do not begin the next step's specification while the previous PR is unmerged.

---

## Per-step template

```
### Step N — <title>  (Phase X — UC-?)
Status: ☐ Not started
Branch: feat/<kebab-name>
Spec: docs/features/<name>.md

Goal: <one sentence>

Tasks:
- [ ] Spec:     docs/features/<name>.md written and approved
- [ ] DB:       …
- [ ] Backend:  …
- [ ] Frontend: …
- [ ] Review:   improvement pass done before tests written
- [ ] Tests:    good paths + bad paths per the spec's scenario list

What I did: <FILL IN ON COMPLETION>
How to view & test: <FILL IN ON COMPLETION — exact commands, URLs, manual steps, test commands>
```

---

## Phase 0 — Local environment & shared infra

### Step 0.1 — Local Postgres + env files (Phase 0)

Status: ✅ Done
Branch: chore/phase-0-skeleton
Spec: docs/features/phase-0-foundation.md

Goal: A new contributor can start Postgres locally and boot both apps with copied `.env` files.

Tasks:

- [x] Infra: `docker-compose.yml` at the repo root with a `postgres:16` service exposing host port 5433 (moved from 5432 in Phase 1 to avoid a native-Postgres collision), named volume for data.
- [x] Infra: `docker/postgres-init/01-create-test-database.sql` creates `music_app_test_db` beside `music_app_dev`.
- [x] Backend: `backend/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `LOG_LEVEL`.
- [x] Frontend: `frontend/.env.example` with `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`.
- [x] Docs: README section "Local setup" with the bring-up commands; `.nvmrc` pins Node 24.

What I did:
Added `docker-compose.yml` running Postgres 16 on host port 5433 with a named volume and a
healthcheck, plus an init script that creates the integration-test database
`music_app_test_db` alongside the development database `music_app_dev` the first
time the volume is initialised. Wrote `.env.example` for both packages with every
variable documented and every value blank or local — no secret is committed.
`JWT_SECRET` and `GOOGLE_CLIENT_ID` are declared now although nothing reads them
until Step 1.3, so the environment is configured once rather than in pieces.
Corrected the README: the test database is `music_app_test_db` (matching
CLAUDE.md §10 and `docs/tests.md` §3.3, not the README's earlier `music_app_test`),
Node is ≥ 24, and Docker Desktop must actually be running.

How to view & test:

```bash
docker compose up -d
```

```bash
docker compose ps
```

The container must report `healthy`. Then:

```bash
docker exec bookrough-postgres psql -U bookrough -d music_app_dev -c "\l"
```

The listing must contain both `music_app_dev` and `music_app_test_db`. To rebuild
from scratch, run `docker compose down -v` and then `docker compose up -d`.

Verified on 2026-09-24: container healthy, both databases present.

---

### Step 0.2 — Backend Express bootstrap (Phase 0)

Status: ✅ Done
Branch: chore/phase-0-skeleton
Spec: docs/features/phase-0-foundation.md

Goal: Express server boots, exposes `GET /api/health`, has the central error middleware and Pino logger wired in.

Tasks:

- [x] Backend: `src/app.ts` builds the app (cors with credentials, cookie-parser, json body, Pino HTTP logger); `src/index.ts` binds the port and handles SIGTERM/SIGINT.
- [x] Backend: `src/config/env.ts` validates the whole environment with Zod at boot and exits naming the offending variable.
- [x] Backend: `src/utils/AppError.ts` and `src/middleware/errorHandler.ts`.
- [x] Backend: `src/utils/response.ts` with `success(data)` / `failure(code, message)` helpers.
- [x] Backend: `src/routes/health.ts` returning `{ status: "ok" }`, plus `notFound` middleware for unmatched paths.
- [x] Tests: Supertest hitting `/api/health`, an intentionally-throwing test route, and two unmatched paths (15 unit + 6 integration assertions).

What I did:
Built the backend skeleton exactly along the Router → Controller → Service layering
of CLAUDE.md §4, with only the layers this step needs. `createApp()` returns the
Express app without listening, so Supertest drives it in-process; binding the port
is `src/index.ts`'s only job. Errors have a single writer: `AppError` for anything
raised deliberately, and a flat 500 "Something went wrong." for everything else,
with the original logged via Pino and never sent to the client. `GET /api/health`
deliberately does not query Postgres — a health check that conflates "the API is
up" with "its dependency is up" makes a deploy platform restart a healthy container
over a transient database blip. A test-only `GET /api/__boom` is mounted solely
under `NODE_ENV=test` to prove the error envelope's shape.

Writing the environment tests caught a real defect: `z.string().url()` accepts
`localhost:5173`, which parses as the scheme `localhost`, so a misconfigured
`CORS_ORIGIN` would have silently failed to match the browser's origin. The
schema now requires a bare http(s) origin.

How to view & test:

```bash
cp backend/.env.example backend/.env
```

Fill in `JWT_SECRET` (any 32+ characters for now) and `GOOGLE_CLIENT_ID` (any
placeholder until Step 1.3), then:

```bash
npm install --prefix backend
```

```bash
npm run dev --prefix backend
```

```bash
curl http://localhost:4000/api/health
```

Expect `{"status":"success","data":{"status":"ok","uptime":…,"timestamp":…}}`.
Then `curl http://localhost:4000/api/nope` → `{"status":"error","code":404,"message":"Route not found."}`.
To see the boot-time environment guard, comment out `DATABASE_URL` in `.env` and
run `npm run dev` again: it exits with the variable named.

```bash
npm run test:unit --prefix backend
```

```bash
npm run test:integration --prefix backend
```

---

### Step 0.3 — Frontend shell (Phase 0)

Status: ✅ Done
Branch: chore/phase-0-skeleton
Spec: docs/features/phase-0-foundation.md

Goal: Vite app boots with React Router, Tailwind, axios client (with 401 interceptor + toast), and a root Error Boundary.

Tasks:

- [x] Frontend: `src/api/client.ts` axios instance + interceptor (401 → `onUnauthorized` + redirect, 4xx/5xx → toast, no response → offline toast).
- [x] Frontend: Toast util (react-hot-toast mounted top-centre in main.tsx).
- [x] Frontend: Root `<ErrorBoundary>` wrapping the routed tree.
- [x] Frontend: React Router with placeholder routes for `/` (Welcome) and `/onboarding`. **No `/login` or `/signup`** — sign-in is a single button on Welcome (CLAUDE.md §5).
- [x] Frontend: Shared `<Spinner>` so no later screen has to invent a loading state.
- [x] Tests: RTL tests for the Error Boundary, the Spinner, all four routes, and every interceptor branch (15 tests, 100% line coverage).

What I did:
Scaffolded Vite + React 19 + TypeScript + Tailwind 4 by hand rather than through a
generator, so the tree contains nothing that has to be deleted later. Three
placeholder pages — Welcome, Complete your profile, and a not-found page that will
later double as the surface a non-admin sees on an admin route (CLAUDE.md §17).
The axios interceptor separates the three failure shapes that are easy to conflate:
a `401` redirects without a toast, a `4xx`/`5xx` toasts the backend's own `message`,
and a failure with no response at all — offline, DNS, CORS, timeout — toasts a
distinct "can't reach the server" message instead of being mistaken for a server
error. The redirect lives behind a named `onUnauthorized()` seam, so Step 1.5 adds
the Zustand store clear without touching the interceptor.

All layout is written for 375px first and every touch target is at least 44px
(CLAUDE.md §8). Verified in the browser at 375×812 before any wider viewport.

How to view & test:

```bash
cp frontend/.env.example frontend/.env
```

```bash
npm install --prefix frontend
```

```bash
npm run dev --prefix frontend
```

Open `http://localhost:5173/` (Welcome), `/onboarding` (Complete your profile),
and any other path such as `/nowhere` (not-found page with a working "Go home"
link). In DevTools, set the viewport to 375px wide and confirm nothing overflows
horizontally.

```bash
npm test --prefix frontend
```

---

### Step 0.4 — Code quality tooling (Phase 0)

Status: ✅ Done
Branch: chore/phase-0-tooling-ci
Spec: docs/features/phase-0-foundation.md

Goal: Conventions are enforced by tooling, not by memory — lint, format, and commit messages are checked automatically before anything reaches the remote.

Tasks:

- [x] Infra: Root ESLint flat config shared by both packages; `npm run lint` at the root.
- [x] Infra: Prettier config + `.prettierignore`; formatting is never a review comment.
- [x] Infra: `.gitattributes` forcing LF, so Windows checkouts and Linux CI agree on line endings.
- [x] Infra: Husky installed; `pre-commit` hook runs `lint-staged` over staged files only.
- [x] Infra: `commitlint` + `@commitlint/config-conventional`; `commit-msg` hook rejects non-Conventional messages.
- [x] Docs: README "Code quality" section, including that `--no-verify` is not permitted.

What I did:
Added a root `package.json` carrying the quality tooling and nothing else —
deliberately not an npm workspace, so `backend/` and `frontend/` keep installing
independently. One flat ESLint config covers both packages, with Node globals on
one side and browser plus React-hooks rules on the other. Type-aware linting is
switched off on purpose: it needs a TypeScript program per package, roughly
triples lint time, and overlaps with what the separate `typecheck` job already
fails on. `no-console` is an error per CLAUDE.md §4 — the one deliberate
exception, the Error Boundary's development-only crash log, carries an inline
disable with its reason.

Two things surfaced while wiring this up. Prettier wanted to reformat all twelve
foundational specs in `docs/`, which are plain-Markdown mirrors of their `.docx`
twins (CLAUDE.md §14.1); reflowing their tables would make the two files differ
for no reason, so `docs/*.md` is excluded while `docs/features/` is not. And
Prettier flagged 58 files purely over line endings, because Git hands Windows a
CRLF checkout while CI runs on Linux — `.gitattributes` with `* text=auto eol=lf`
settles that permanently rather than per-machine.

How to view & test:

```bash
npm install
```

```bash
npm run lint
```

```bash
npm run format:check
```

Both must pass with no findings. To see the hooks bite, try a badly-worded commit
message on a scratch branch:

```bash
git commit --allow-empty -m "fixed stuff"
```

commitlint rejects it and names the rule; `chore: valid message` is accepted.
Verified on 2026-09-24: the rejection fires and exits non-zero.

---

### Step 0.5 — GitHub Actions CI + branch protection (Phase 0)

Status: ✅ Done
Branch: chore/phase-0-tooling-ci
Spec: docs/features/phase-0-foundation.md

Goal: The merge gate exists **before** the first feature PR, not after. A red check blocks merge on `main`.

> Deliberately placed in Phase 0 rather than Phase 6. CI that arrives after twenty merged PRs has failed at its job — it must gate the first one.

Tasks:

- [x] Infra: `.github/workflows/pr.yml` — parallel jobs `lint`, `typecheck`, `test:unit`, `test:integration` (against a `postgres:16` service container).
- [x] Infra: `.github/workflows/main.yml` — everything in `pr.yml` plus `test:e2e`, on push to `main` and nightly at 03:00 UTC.
- [x] Infra: Vitest coverage configured with the 80% line floor and documented exclusions.
- [x] Infra: `e2e/` package at the repo root — Playwright config, zero specs, so `main.yml` has a real target before Step 1.7 fills it.
- [x] Decide: How the backend's 80% floor is measured. Settled: over both backend suites in one pass, in the job that already has Postgres. `docs/tests.md` §4.1 and its `.docx` twin updated to match.
- [x] Infra: Branch protection on `main` — no direct pushes, PR required, `pr.yml` checks required, squash-merge only.
- [x] Tests: Prove the gate works by opening a throwaway PR with a deliberately failing test and confirming merge is blocked.

What I did:
Two workflows. `pr.yml` runs four jobs in parallel on every pull request and is
what branch protection requires; `main.yml` runs the same four plus Playwright on
every push to `main` and nightly. E2E stays off the PR path deliberately —
installing browsers and driving real flows costs minutes and is the flakiest
layer, and a flaky test that blocks every merge gets disabled, which is worse
than no test. The nightly run exists because the scraper depends on a live
external site that can break the core feature without any change of ours.

The coverage question raised at the end of the previous PR is settled here.
Backend unit coverage alone reports 43.8%, because `app.ts`, both middleware and
the route files are covered by the Supertest suite running under a different
config. Measuring either suite alone misrepresents the other, and excluding those
files to make the number look right is the gaming CLAUDE.md §10 forbids. So
`backend/vitest.coverage.config.ts` runs both suites in one pass and enforces the
floor there, inside the integration job that already has Postgres. Merged result:
**95.3%**. The frontend has a single suite, so its floor sits in its own config —
**100%**.

Measuring honestly paid for itself immediately: it exposed that the error
handler's most important branch — flattening an unexpected error into a generic
500 — had no test at all. That is the path standing between a Prisma error
carrying a connection string and the client. It now has three assertions, and the
error handler is at 100%.

How to view & test:

```bash
npm run test:coverage --prefix backend
```

Expect 95.3% lines and a pass. To watch the floor bite, temporarily raise
`thresholds.lines` in `backend/vitest.coverage.config.ts` to 99 and re-run — the
command exits non-zero.

```bash
npm test --prefix e2e
```

Passes with no specs to run, by design, until Step 1.7.

The CI itself is visible on the pull request's Checks tab. The gate was proved by
opening a throwaway PR containing one deliberately failing assertion and
confirming GitHub refused the merge — recorded in the PR description.

---

## Phase 1 — Foundation & Identity (UC-1, UC-2, UC-3)

> **Scope shrank.** Email/password auth and password recovery were dropped in favour of Google Sign-In only, and user email addresses are no longer stored at all (CLAUDE.md §5). Former steps 1.2 (email/password routes) and 1.4 (forgot-password flow) are **withdrawn**; UC-17 is withdrawn with them.
>
> **Re-sliced (2026-10-01).** Steps 1.1 (schema) and 1.5 (Welcome screen) were merged into Step 1.3, because on their own neither 1.1 nor 1.3 shipped anything clickable (CLAUDE.md §11, vertical slicing). Their numbers are kept as pointers, like the withdrawn steps.

### Step 1.1 — _(merged into Step 1.3)_ Prisma users schema

> The `users` table ships with Sign in with Google. See Step 1.3.

---

### Step 1.2 — _(withdrawn)_ Email/password auth routes

> Withdrawn. Google Sign-In is the only authentication method (CLAUDE.md §5). There are no registration, login, or password endpoints to build. The step number is retained rather than reused so that references in git history stay meaningful.

---

### Step 1.3 — Sign in with Google (Phase 1 — UC-1, UC-2, UC-3)

Status: ✅ Done
Branch: feat/auth-google
Spec: docs/features/google-auth.md

Goal: A user taps Continue with Google and is signed in; a first-time user lands on the (placeholder) Complete Your Profile screen, a returning one on the (placeholder) home screen. The session lasts 30 days and slides with use. The app never learns the user's email or real name.

Tasks:

- [x] Spec: docs/features/google-auth.md written and approved
- [x] DB: `users` table + `StreamingService` / `UserRole` enums, migration `init_users`. No `email`, `password_hash` or `username`; one unique `display_name` (via `display_name_key`); profile columns nullable until onboarding.
- [x] Backend: `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`; JWT cookie with sliding renewal; `requireAuth`; `toPublicUser`; malformed JSON → `400`.
- [x] Frontend: Welcome screen, auth store, session bootstrap, route guards, placeholder Complete Your Profile and Home with Sign out.
- [x] Frontend: semantic design tokens (light + dark), self-hosted fonts, `components/ui/` primitives.
- [x] Docs: `username` removed and session/same-site decisions recorded across the foundational specs (.md + .docx), CLAUDE.md, tech stack.
- [x] Review: `/code-review` and `/security-review`, findings worked through.
- [x] Tests: the scenario list in the spec §7, including the privacy regression test.

What I did:

Built the first vertical slice of Phase 1 (UC-1 first half, UC-2, UC-3) per `docs/features/google-auth.md`.

- **DB:** `backend/prisma/schema.prisma` — `User` model, `StreamingService` and `UserRole` enums; migration `init_users`. No `email`, `password_hash` or `username`; `display_name` / `display_name_key` (unique) / `preferred_service` are nullable until onboarding.
- **Backend:** `services/googleIdentity.service.ts` (verifies the Google token; keys fetched first so an outage is `503`, a bad token `401`; rejection logs carry a fixed reason label only, because the library's messages embed the token payload), `services/auth.service.ts` (find-or-create by `google_sub`, picture refresh, concurrent-create fallback), `controllers/auth.controller.ts` + `routes/auth.ts` (`POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`), `middleware/requireAuth.ts` (loads the user every request, sliding 30-day renewal), `utils/jwt.ts`, `utils/sessionCookie.ts`, `utils/publicUser.ts` (`toPublicUser`), `utils/validate.ts`. The error handler now passes client-caused body errors through (`400` bad JSON, `413`, `415`) instead of `500`. Prisma disconnects on shutdown.
- **Frontend:** `pages/Welcome.tsx` (Google button, signing-in / Google-error / server-error / blocked-script / offline states), `stores/auth.ts`, `api/auth.ts`, `components/RouteGuards.tsx` (session bootstrap with a retry screen; guards for `/`, `/onboarding`, `/home`), placeholder `pages/CompleteProfile.tsx` and `pages/Home.tsx` with Sign out. Semantic design tokens with dark mode in `index.css`, self-hosted fonts, `components/ui/` (`Button`, `Avatar`, `Wordmark`, `ScreenLayout`, `Spinner`). A `401` now clears the store and the guards redirect.
- **Infra:** local Docker Postgres moved to host port **5433** (a native Postgres held 5432). Integration suites migrate the test DB in a Vitest `globalSetup`.
- **Docs:** `username` removed and the display-name, session and same-site decisions recorded across `tables`, `auth`, `use cases`, `frontend screens`, `general`, `system architecture conventions`, `git workflow`, `deployment`, `tech stack` (.md + .docx), and CLAUDE.md.
- **Tests:** backend 58 unit + 33 integration (96% lines over both); frontend 54 component/unit (99.6% lines). Includes the privacy regression test, which fails if the old log leak is reintroduced.

How to view & test:

One-time: your `backend/.env` must use port **5433** in `DATABASE_URL` (already updated), and the Google OAuth client must list `http://localhost:5173` as an authorised JavaScript origin.

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Open `http://localhost:5173/` (phone width first: DevTools → 375px).

1. Welcome shows the purple wordmark, the value line, **Continue with Google**, and "No passwords. We never store your email."
2. Sign in with Google → "Signing you in…" → **Complete your profile** (placeholder) with your Google picture.
3. Reload the page → you stay signed in (no flash of Welcome).
4. Visit `/home` → redirected back to `/onboarding` (profile not set yet).
5. **Sign out** → back on Welcome; visiting `/onboarding` now redirects to `/`.
6. DevTools → Network → offline, then reload → "Can't reach BookRough right now" with **Try again**.

Tests:

```bash
cd backend && npm run test:unit            # unit
cd backend && npm run test:integration     # Supertest against music_app_test_db
cd backend && npm run test:coverage        # both suites, 80% floor
cd frontend && npm run test:unit           # components, 80% floor
cd backend && npx vitest run --config vitest.integration.config.ts -t "privacy"   # the privacy regression test only
```

---

### Step 1.4 — _(withdrawn)_ Forgot-password flow

> Withdrawn with UC-17. No passwords exist and no email address is stored, so there is nothing to reset and nowhere to send a link. The `password_resets` table was removed from the schema, and the mail-provider question that this step depended on is closed by deletion rather than deferred.

---

### Step 1.5 — _(merged into Step 1.3)_ Auth UI: Welcome screen

> The Welcome screen ships with Sign in with Google. See Step 1.3.

---

### Step 1.6 — Complete-Your-Profile onboarding (Phase 1 — UC-1)

Status: ✅ Done
Branch: feat/onboarding-profile
Spec: docs/features/onboarding.md

Goal: A new user sets their display name, preferred service, and avatar (Google photo or generated) before the dashboard becomes reachable.

Tasks:

- [x] Spec: docs/features/onboarding.md written and approved (display-name rules, normalisation, reserved names, avatar choice).
- [x] DB: migration `add_use_google_picture`.
- [x] Backend: `PATCH /api/users/me` and `GET /api/users/display-name-availability`; `P2002` on `display_name_key` → `409` "That display name is already taken."; sign-in stops storing a declined Google photo.
- [x] Frontend: `pages/CompleteProfile.tsx` replaces the placeholder — avatar choice, display name with live availability feedback, preferred-service selector.
- [x] Review: `/code-review` (6 findings: 5 fixed, 1 accepted as a documented limitation) and `/security-review` (clean).
- [x] Tests: Good: profile saves and the guard releases. Bad: duplicate display name (including a case/whitespace variant) → inline error; missing preferred service → 422; unauthenticated → 401.
- [x] Tests: Abandoned onboarding — signing in again with the same `sub` resumes rather than creating a second row.

What I did:

Built Complete Your Profile (UC-1, second half) per `docs/features/onboarding.md`.

- **DB:** migration `add_use_google_picture` (`users.use_google_picture`, default false).
- **Backend:** `services/displayName.ts` (cleaning incl. iOS smart apostrophes, 2–20 graphemes + 50-code-point ceiling, allowed characters, Hangul fillers rejected, uniqueness key ignoring case/spacing/accents/niqqud/compatibility forms, reserved-name list); `services/user.service.ts` (`updateProfile`, `checkAvailability`); `controllers/user.controller.ts` + `routes/users.ts` (`PATCH /api/users/me`, `GET /api/users/display-name-availability`; duplicate → `409`). Sign-in no longer stores a declined Google photo (`auth.service.ts`). `sessionUser(req)` replaces the repeated `req.user` guard.
- **Frontend:** `pages/CompleteProfile.tsx` (avatar choice with generated default, display name with live debounced availability, service picker with nothing pre-selected, saving / race / offline states); `lib/displayName.ts` (client mirror of the rules); `hooks/useDisplayNameStatus.ts`, `hooks/useSignOut.ts`, `hooks/useOnlineStatus.ts` (extracted from Welcome); `api/users.ts`; `Avatar` gains a `decorative` mode.
- **Docs:** `tables`, `auth`, `use cases`, `frontend screens`, `general` (.md + .docx) and CLAUDE.md §5/§8 updated for the avatar choice; `google-auth.md` marked merged.
- **Tests:** backend 180 (97% lines over both suites), frontend 96 (99.5%). The display-name example table is shared by both mirrors' tests.

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px width and sign in with a Google account that has never used the app (or delete your row: `docker exec bookrough-postgres psql -U bookrough -d music_app_dev -c 'DELETE FROM users;'`).

1. Complete Your Profile shows: Generated avatar selected, your Google photo as the second option, an empty name, five unselected services, Continue disabled.
2. Type `a<b` → "That character isn't allowed." (no network request). Type `Admin` → "That name is reserved." Type a free name → "Checking…" then "✓ Available"; the generated avatar shows its initials.
3. Pick a service → Continue enables → "Saving…" → home placeholder shows your name.
4. Sign out and sign in again → straight to home. If you kept the generated avatar, your Google photo is not shown or stored (`SELECT profile_picture_url FROM users;` is empty).
5. Second Google account: try the same name in another case or with niqqud → "That display name is already taken."

Tests:

```bash
cd backend && npm run test:coverage                 # unit + integration, 80% floor
cd backend && npx vitest run src/services/displayName.test.ts
cd frontend && npm run test:unit                    # includes CompleteProfile.test.tsx
```

---

### Step 1.7 — Phase 1 E2E coverage (Phase 1 — UC-1, UC-2, UC-3)

Status: ✅ Done
Branch: chore/auth-flow-e2e
Spec: docs/features/auth-flow-e2e.md

Goal: Playwright covers sign-in through onboarding to the dashboard.

Tasks:

- [x] Spec: docs/features/auth-flow-e2e.md written and approved.
- [x] Backend: Google stand-in — optional `E2E_GOOGLE_PUBLIC_KEY`, verified with RS256/audience/issuer/expiry; the API refuses to start with it unless `NODE_ENV=test`.
- [x] Tests: E2E with a stubbed Google identity token: first sign-in → Complete Your Profile → home; reload keeps the session; logout returns to Welcome; second sign-in → straight to home; abandoned onboarding resumes.
- [x] Tests: The stand-in is documented in `docs/tests.md` §3.4 (+ `.docx`) and `e2e/fixtures/README.md`.
- [x] CI: `main.yml` installs WebKit as well as Chromium and passes the stand-in key to the API.
- [x] Review: `/code-review` (5 findings: 4 fixed, E2E typecheck deferred — needs `typescript` in `e2e/`) and `/security-review` (clean).

What I did:

Closed Phase 1 with an end-to-end suite (UC-1, UC-2, UC-3) per `docs/features/auth-flow-e2e.md`.

- **Google stand-in:** `e2e/support/googleStandIn.ts` replaces Google's sign-in script in the browser with a stub whose button returns an ID token signed with the throwaway key in `e2e/fixtures/`; `backend/src/services/googleIdentity.service.ts` verifies such tokens when `E2E_GOOGLE_PUBLIC_KEY` is set. `backend/src/config/env.ts` refuses that setting unless `NODE_ENV=test`, and the API prints a warning to stderr whenever it is active.
- **Specs:** `e2e/tests/auth-flow.spec.ts` — three golden loops, each with a fresh Google account, in desktop Chromium and iPhone-sized WebKit (6 runs).
- **Local runs:** `e2e/playwright.config.ts` builds and starts the API (port 4100) and the frontend preview (port 4173) against `music_app_test_db`, so the dev servers and dev database are untouched.
- **CI:** `main.yml` now installs WebKit (the `mobile-safari` project existed but its browser was never installed) and starts the API with the stand-in key.
- **Tests added:** 11 backend unit tests (env refusal in production / development / unset; stand-in accepts its key and rejects other keys, audience, issuer, expiry, missing sub, HS256 forgery).

How to view & test:

One-time, if Playwright's browsers are missing on the machine:

```bash
cd e2e && npx playwright install chromium webkit
```

Run the suite (Docker Postgres must be up; it builds and serves both apps itself):

```bash
docker compose up -d
cd e2e && npm test
```

Expected: `6 passed`. To watch it run in a visible browser:

```bash
cd e2e && npm run test:headed
```

Backend tests for the stand-in and its guard:

```bash
cd backend && npx vitest run src/config src/services/googleIdentity
```

---

## Phase 2 — Core Social Structures (UC-4, UC-9, UC-10, UC-14, UC-15, UC-19)

> Phase 2 now also carries the **administrative area** (Steps 2.8, 2.9). It was pulled forward from a later phase so that users and communities can be managed while the app is being trialled with real friends.

> **Re-sliced 2026-10-03.** The original Steps 2.1–2.7 split Phase 2 by layer (schema, backend, screens, tests), and most of them could not merge alone under CLAUDE.md §11. They became four vertical features, each with its own spec session — see `docs/features/communities-create.md` §0. The original step numbers are kept so references stay valid.

### Step 2.1 — Communities: create and dashboard (Phase 2 — UC-9)

Status: ✅ Done
Branch: feat/communities-create
Spec: docs/features/communities-create.md

Goal: A signed-in user creates a community, becomes its admin, lands on its page, and sees all their communities on a real dashboard. A tab bar is in place for the whole app.

Tasks:

- [x] Spec: docs/features/communities-create.md written and approved (re-slice of Phase 2, schema, name rules, screens).
- [x] DB: migration `add_communities` — `communities`, `community_members`, `CommunityRole`; no `cover_image_url`, no `invite_token` (feature 2).
- [x] Backend: `POST /api/communities`, `GET /api/communities`, `GET /api/communities/:id` (non-member / missing / malformed → one `404`); `toPublicCommunity`.
- [x] Frontend: Communities Dashboard replaces the `/home` placeholder; Create Community (full-screen); community page shell; bottom tab bar (Search and My List "Coming soon"); minimal Profile tab with Sign out.
- [x] Review: `/code-review` (9 findings: 8 fixed, 1 skipped as negligible) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §8.

What I did:

Built the first Phase 2 feature (UC-9) per `docs/features/communities-create.md`.

- **DB:** migration `add_communities`. Composite primary key on memberships, an index on `community_id`, cascades both ways, `updated_at` on both tables. The creator's `ADMIN` membership is written in the same nested create as the community.
- **Backend:** `services/textRules.ts` (cleaning and character rules now shared by display names and community names; `displayName.ts` refactored onto it); `services/communityText.ts` (name 2–40 graphemes with `& ! ? , : ( ) "`, optional description up to 280 with line breaks); `services/community.service.ts`, `controllers/community.controller.ts`, `routes/communities.ts`; `utils/publicCommunity.ts`. Creating needs finished onboarding (`403` otherwise).
- **Frontend:** `pages/Dashboard.tsx` (skeleton / empty / error states, floating Create), `pages/CreateCommunity.tsx` (live cover preview, counters, UC-9 required-name error, static "Invite friends" card, offline banner), `pages/Community.tsx` (shell; `404` → not-found page), `pages/Profile.tsx`, `pages/ComingSoon.tsx`, `components/BottomNav.tsx` + `TabLayout.tsx`, `components/ui/CommunityCover.tsx`, `Skeleton`, `LoadError`; `hooks/useRequest.ts`; client mirrors `lib/textRules.ts`, `lib/communityText.ts`. The `Home` placeholder and `SignedInPlaceholder` are gone.
- **Found by the tests:** the Hebrew geresh (`׳`, as in ג׳אז or ג׳ני) is Unicode punctuation, so it was rejected in display names too. It is now allowed in every name, and a geresh and an apostrophe share one uniqueness key (`docs/features/onboarding.md` amended). Cover initials skip leading punctuation ("(Friday) Jazz" → "FJ").
- **Docs:** `tables`, `use cases` (UC-9), `frontend screens` (.md + .docx); `onboarding.md`, `auth-flow-e2e.md` amended; this re-slice.
- **Tests:** backend 275 (97.8% lines over both suites), frontend 170 (97.9%), E2E 8 (the Phase 1 loops now go through the dashboard and sign out from the Profile tab, plus the new create-a-community loop, each in Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px width and sign in with an onboarded Google account.

1. Home is now **Your communities**, with the empty state "Start your first community" and one **Create community** button. The tab bar shows Home, Search, My List, Profile.
2. Tap **Create community**. Tap into Name, then into Description → "A Community name is required." and Create stays disabled. Type `a@b` → "That character isn't allowed."
3. Type `Friday Jazz & Soul!` → the cover preview shows "FJ" over a neutral colour, the counter reads 19/40. Add a description with a line break, then **Create** → "Creating…" → the community page: coloured cover, name, description with its line break, "1 member · You're an admin", "Posts are coming soon".
4. Press Back → the dashboard (not the form), with the card "1 member · Admin". Create a second community → it appears first.
5. Open `http://localhost:5173/communities/00000000-0000-4000-8000-000000000000` → "This page doesn't exist".
6. **Search** and **My List** show "Coming soon"; **Profile** shows your name, service and **Sign out**.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/communityText.test.ts src/services/community.service.test.ts
cd backend && npm run test:integration -- communities
cd frontend && npm run test:unit                          # Dashboard, CreateCommunity, Community, TabLayout, Profile
npm test --prefix e2e                                     # 8 runs, needs Docker Postgres
```

---

### Step 2.2 — Invites and joining (Phase 2 — UC-15)

Status: ✅ Done
Branch: feat/communities-invites
Spec: docs/features/communities-invites.md

Goal: A community admin gets an invite link; a friend opens it, sees a "Join Community" preview, and joins with one tap. Absorbs the invite half of former 2.2, the accept half of former 2.3, and former 2.6.

Tasks:

- [x] Spec: docs/features/communities-invites.md written and approved (one link per community, admins only, public preview, panel on the community page).
- [x] DB: migration `add_community_invite_token` — `communities.invite_token` (unique, nullable, created lazily).
- [x] Backend: `GET /api/communities/:id/invite`, `POST /api/communities/:id/invite/reset` (admins), `GET /api/invites/:token` (public, `optionalAuth`), `POST /api/invites/:token/accept` (idempotent).
- [x] Frontend: Join Community preview at `/invite/:token` with Google sign-in and the return trip through onboarding; invite panel on the community page (Share / Copy / Reset), opening once after creating.
- [x] Review: `/code-review` (7 findings, all fixed — including the token leaking into logs through the request path) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7, including a test that the token appears in no response and no log line.

What I did:

Built invites and joining (UC-15) per `docs/features/communities-invites.md`.

- **DB:** migration `add_community_invite_token`. One token per community: 128 random bits, base64url, created the first time an admin opens the panel (conditionally, so two admins cannot overwrite each other), replaced on reset.
- **Backend:** `services/invite.service.ts` (admin check — non-member `404`, member `403`; lazy create; reset; public preview; idempotent accept, with `P2002` → already in and `P2003` → the UC-15 `404`); `controllers/invite.controller.ts`, `routes/invites.ts`, two routes on `routes/communities.ts`; `utils/inviteToken.ts`, `utils/invitePreview.ts`; `optionalAuth` in `middleware/requireAuth.ts`; `utils/redactPath.ts`, used by pino-http and the error handler so `/invites/<token>` is logged as `/invites/:token`.
- **Frontend:** `pages/InvitePreview.tsx` (signed out / signed in / already a member / invalid link / offline); `components/InvitePanel.tsx` and the `Sheet` primitive (bottom sheet, focus kept inside, Escape, page scroll locked, stays open during a reset); `components/GoogleSignIn.tsx` extracted from Welcome with no behaviour change; `lib/pendingInvite.ts` + `homePathFor` bring a new user back to the invite after onboarding; `api/invites.ts`.
- **Found by the E2E test:** the signed-out visitor's first `401` clears the session twice, and the second clear landed after the preview had remembered the invite, so new users ended on the dashboard. The pending invite is now dropped only on an explicit sign-out.
- **Docs:** `tables`, `use cases` (UC-15), `frontend screens` (new 3.5 Join Community; the catalog is now fourteen screens) (.md + .docx); CLAUDE.md §8 screen count; `communities-create.md` marked merged.
- **Tests:** backend 328 (97.3% lines over both suites), frontend 211 (99.5%; the communities and invites API modules are now covered too), E2E 12 (new: a fresh friend signs up through the link and joins; a reset link is dead — both in Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

You need two Google accounts (or a second browser profile for the friend). Open `http://localhost:5173/` at 375px width.

1. As account A, create a community → the **Invite friends** panel opens by itself with the link. **Copy** shows "Copied"; on an iPhone, **Share** opens the share sheet. Close it and reload → it does not reopen; the **Invite friends** button reopens it.
2. In a private window (signed out), open the link → "You're invited to", the cover, name, "1 member", and **Continue with Google to join**.
3. Sign in there with account B. If B is new: Complete Your Profile → you return to the invite. Tap **Join community** → the community page shows "2 members", and B sees no Invite button.
4. Open the link again as B → "You're already in this community." with **Open**.
5. As A, **Reset link** → confirm → "New link created. The old one no longer works." Open the old link → the UC-15 message.

Tests:

```bash
cd backend && npm run test:coverage                     # unit + integration, 80% floor
cd backend && npx vitest run src/services/invite.service.test.ts
cd backend && npm run test:integration -- invites
cd frontend && npm run test:unit                        # InvitePreview, InvitePanel, pendingInvite
npm test --prefix e2e                                   # 12 runs, needs Docker Postgres
```

---

### Step 2.3 — Membership management (Phase 2 — UC-10, UC-14)

Status: ✅ Done
Branch: feat/communities-membership
Spec: docs/features/communities-membership.md

Goal: Community Settings & Members — leave, remove (and block), roles, ownership transfer, edit, delete. Absorbs the leave/kick half of former 2.3 and the settings half of former 2.5.

Tasks:

- [x] Spec: docs/features/communities-membership.md written and approved (owner role, removal blocks, owner transfer, delete with a checkbox).
- [x] DB: migrations `add_community_owner_role` and `backfill_community_owners` — `OWNER` role (one per community, partial unique index; existing communities' earliest admin became owner) and the `community_bans` table.
- [x] Backend: `GET /members`, `DELETE /members/me`, `DELETE` / `PATCH /members/:userId`, `POST /ownership`, `GET /bans`, `DELETE /bans/:userId`, `PATCH` / `DELETE` on the community; blocked users get the UC-15 `404` from the invite preview and accept.
- [x] Frontend: `pages/CommunitySettings.tsx` (members, roles, removal with blocking, blocked list, edit, leave, transfer, delete), Settings link on the community page, "Owner" labels.
- [x] Review: `/code-review` (8 findings, all fixed — including three races that could leave a community with no owner) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7, including the partial index, the migration backfill, and the race branches.

What I did:

Built Community Settings & Members (UC-10, UC-14) per `docs/features/communities-membership.md`.

- **DB:** `OWNER` joins `CommunityRole`; exactly one per community through the hand-written partial index `community_members_one_owner`; the backfill made each existing community's earliest admin its owner. New table `community_bans` (eighth table).
- **Backend:** `services/communityAccess.ts` (shared member / admin / owner checks, ban lookup), `services/membership.service.ts`, `controllers/membership.controller.ts`; `updateCommunity` and `deleteCommunity` in `community.service.ts`; `utils/communityMember.ts` (member and blocked-user serialisers with a three-field user). Every role-dependent write is conditional on the role just checked, so concurrent changes are refused instead of misapplied. Creators are now `OWNER`.
- **Frontend:** `pages/CommunitySettings.tsx` with `ConfirmSheet` (remove, make owner, leave, the owner's leave message, delete with the checkbox); the name/description fields shared with Create through `hooks/useCommunityDetailsForm.ts` and `components/CommunityDetailsFields.tsx`; `lib/communityRoles.ts` mirrors the server's permission rules; `api/membership.ts`.
- **Docs:** `tables` (owner role, `community_bans`, eight tables), `use cases` (UC-9 owner, UC-10 owner fail path, UC-14 blocking), `frontend screens` (3.3) (.md + .docx); CLAUDE.md §6.
- **Tests:** backend 375 (98.0% lines over both suites), frontend 247 (99.0%), E2E 16 (new: remove → blocked → unblock → rejoin; transfer → leave → delete — both in Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts again (A creates, B joins through A's link — see Step 2.2). Open `http://localhost:5173/` at 375px width.

1. As A, open the community → **Settings**. You are "Owner"; B is listed. Tap **⋯** next to B → **Make admin** → B shows "Admin"; **⋯** → **Make member**.
2. **⋯** → **Remove from community** → confirm. B moves to **Blocked**. As B, reload the community → "This page doesn't exist"; open the invite link → the invalid-link message.
3. As A, **Unblock** B. As B, open the link again → **Join community** works.
4. As A, edit the name → **Save changes** → "Changes saved".
5. As A, **Leave community** → the owner message. **⋯** next to B → **Make owner** → confirm → you are "Admin", B is "Owner"; now **Leave community** works.
6. As B, **Delete community** → the button stays disabled until "I understand this can't be undone" is ticked → the community disappears.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npm run test:integration -- membership
cd backend && npx vitest run src/services/membership.service.test.ts
cd frontend && npm run test:unit                          # CommunitySettings, communityRoles
npm test --prefix e2e                                     # 16 runs, needs Docker Postgres
```

---

### Step 2.4 — My Profile / Settings (Phase 2 — UC-3, UC-4)

Status: ✅ Done
Branch: feat/profile-settings
Spec: docs/features/profile-settings.md

Goal: The Profile tab becomes the full My Profile / Settings screen: edit display name and preferred service, avatar, visible Log Out. Absorbs former 2.4 and the profile half of former 2.5. Includes the open question of re-choosing a declined Google photo (`onboarding.md` §2).

Tasks:

- [x] Spec: docs/features/profile-settings.md written and approved (re-choosing the Google photo needs a fresh Google sign-in from the same account; no rename limits).
- [x] Backend: `POST /api/users/me/google-picture` (`rechooseGooglePicture` in `user.service.ts`); `PATCH /api/users/me` reused for name, service and the switch to the generated avatar.
- [x] Frontend: `pages/Profile.tsx` (the full screen); `components/GoogleCredentialButton.tsx`, `DisplayNameField.tsx`, `StreamingServicePicker.tsx` extracted and shared with onboarding.
- [x] Review: `/code-review` (1 finding, fixed: the avatar showed the offline hint during a save) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built My Profile / Settings (UC-4, UC-3) per `docs/features/profile-settings.md`.

- **Backend:** `rechooseGooglePicture` verifies a fresh Google ID token like a sign-in, requires its `sub` to match the account, and stores only its `picture` (`useGooglePicture = true`). A rejected token is `422` (not `401`, which would sign a valid session out); a different account is `403`; no photo is `422`; not onboarded is `403`; Google unreachable stays `503`. No migration.
- **Frontend:** the Profile tab is now the full screen — avatar switch (generated ⇄ Google photo), display name with the live availability check, service picker, one **Save changes** that sends only what changed and toasts "Profile updated", offline banner, Sign out. The Google button, name field and service picker are shared components, so onboarding and My Profile apply the same rules and states.
- **Docs:** `use cases` (UC-3, UC-4), `frontend screens` (4.3), `auth` (the photo's way back) (.md + .docx); CLAUDE.md §5 and §8; `onboarding.md` pointer.
- **Tests:** backend 395 (98.1% lines over both suites), frontend 260 (98.5%), E2E 20 (new: rename + change service persist after reload; Google photo re-chosen through the stand-in and switched back — both in Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px width and sign in with Google (onboard with the generated avatar).

1. Tap the **Profile** tab → "Your profile". **Save changes** is disabled.
2. Change the display name → "✓ Available" → pick another service → **Save changes** → "Profile updated". Reload: both persist.
3. Type a name another account uses → "That display name is already taken." and Save stays disabled.
4. Under the avatar, **Continue with Google** with the same account → your Google photo appears and the button becomes **Use generated avatar**. Try a different Google account → "That's a different Google account…".
5. **Use generated avatar** → initials again; the photo URL is deleted from the database.
6. Turn the network off (DevTools → Offline) → the offline banner; Save and the avatar actions are disabled; **Sign out** still works.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npm run test:integration -- users
cd backend && npx vitest run src/services/user.service.test.ts
cd frontend && npm run test:unit                          # Profile, CompleteProfile
npm test --prefix e2e                                     # 20 runs, needs Docker Postgres
```

---

### Step 2.5 — _(split across 2.1, 2.3 and 2.4)_ Community + profile UI

Each screen ships with the feature that needs it (vertical slicing, CLAUDE.md §11).

---

### Step 2.6 — _(merged into Step 2.2)_ Invite deep links

---

### Step 2.7 — _(dissolved)_ Phase 2 test coverage

Every feature ships its own tests (CLAUDE.md §15); there is no separate test step.

---

### Step 2.8 — Admin area: user list (Phase 2 — UC-19)

Status: ✅ Done
Branch: feat/admin-user-list
Spec: docs/features/admin-panel.md

Goal: The owner can sign in and review the user base. Nobody else can reach the area, or tell that it exists.

> **Stage 1 must come first and must settle scope.** This is the step most likely to sprawl into a CMS. Write `docs/features/admin-panel.md` and get it approved before any code.

Tasks:

- [x] Spec: docs/features/admin-panel.md written and approved — lists plus three fixed settings, a visible change history, two PRs (this one and Step 2.9). The settings table moved to Step 2.9.
- [x] Backend: `requireAppAdmin` on `users.role = 'ADMIN'` (read from the database each request, onboarding required), on every admin route.
- [x] Backend: `GET /api/admin/users` — display name, avatar, preferred service, join date, community count. **No email: none is stored** (CLAUDE.md §5). `GET /api/admin/communities` — name, member count, created date, owner.
- [x] Frontend: Admin screen (Users, Communities tabs), reachable only for admins; the Admin area link on My Profile hidden for everyone else.
- [x] Review: `/code-review` (1 finding, fixed: the list showed Google photos users had not chosen) and `/security-review` (clean). Both responses go through explicit serialisers.
- [x] Tests: an admin lists users and communities; `401`, `403` for a user and for an admin mid-onboarding, `403` right after the role is removed; not-found in the frontend.
- [x] Tests: **Privacy test** — no admin response contains an email-shaped string, a Google `sub` or a display-name key.

What I did:

Built Part 1 of the administrative area (UC-19) per `docs/features/admin-panel.md`.

- **Backend:** `middleware/requireAppAdmin.ts` (named apart from the community-level `requireAdmin`); `services/admin.service.ts` and `utils/adminViews.ts` (`toAdminUser`, `toAdminCommunity`, narrow selects); `controllers/admin.controller.ts`, `routes/admin.ts`. `sessionPayload` now carries `isAdmin` (the caller's own flag). No migration.
- **Frontend:** `pages/Admin.tsx` (tabs as routes: `/admin/users`, `/admin/communities`), `AdminOnly` in `components/RouteGuards.tsx` (not-found for anyone not a signed-in admin, without a request), `api/admin.ts`, `isAdmin` in the auth store, the Admin area link on My Profile. A `403` mid-session drops the flag and the area turns into not-found.
- **Docs:** `frontend screens` (Administration group; fifteen screens; the stale Profile line), `use cases` (UC-19's decided scope), `auth` (§5: role read per request, `isAdmin` in the session) (.md + .docx); CLAUDE.md §8 and §17.
- **Tests:** backend 426 (98.1% lines over both suites), frontend 274 (98.2%), E2E 22 (new: an admin opens the lists from My Profile; a normal user sees not-found — both in Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Make yourself an admin — the role is set in the database only (CLAUDE.md §17):

```bash
docker exec -it bookrough-postgres psql -U bookrough -d music_app_dev -c "UPDATE users SET role = 'ADMIN' WHERE display_name = '<your display name>';"
```

Open `http://localhost:5173/` at 375px width, sign in (or reload if already signed in).

1. **Profile** tab → **Admin area** → "Admin", Users tab: everyone, newest first, with "Admin" next to you.
2. **Communities** tab: each community with its member count and owner.
3. Sign in as another (non-admin) account and open `http://localhost:5173/admin` → "This page doesn't exist"; no Admin area link on its Profile.
4. Remove your role (`SET role = 'USER'`) while the Admin screen is open, then switch tabs → the area turns into the not-found page.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npm run test:integration -- admin
cd frontend && npm run test:unit                          # Admin, Profile
npm test --prefix e2e                                     # 22 runs, needs Docker Postgres
```

---

### Step 2.9 — Admin area: presentation settings (Phase 2 — UC-19)

Status: ✅ Done
Branch: feat/admin-settings
Spec: docs/features/admin-panel.md

Goal: The owner can change presentation configuration and have it take effect for everyone, with a record of who changed what.

Tasks:

- [x] DB: migration `add_app_settings` — `SettingKey` enum, `app_settings`, `setting_changes` (ten tables).
- [x] Backend: `GET` / `PATCH /api/admin/settings`, admin-gated, Zod for shapes and the code registry for the rules; public `GET /api/settings` (the banner only for signed-in callers).
- [x] Backend: a history row on every real change: actor, setting, old value, new value, timestamp — written in the same transaction, under a lock.
- [x] Frontend: the Settings tab; the accent colour, tagline and banner applied for everyone.
- [x] Review: `/code-review` (1 finding, fixed: a `403` on Save showed an inline error instead of ending the admin view) and `/security-review` (clean). An unknown key is a `422`, and no colour value from the database ever reaches a style.
- [x] Tests: a setting changes and persists, its history row is written; non-admin `403`, unknown key `422`, out-of-range values `422`, no-ops write nothing.

What I did:

Built Part 2 of the administrative area (UC-19) per `docs/features/admin-panel.md`.

- **DB:** `app_settings` (one row per setting ever changed; missing = default) and `setting_changes` (the history; `changed_by_id` set to null if the admin's account goes).
- **Backend:** `services/appSettings.ts` — the registry (three keys, their rules, their defaults), reads that fall back to the default for a value the rules reject, and `updateSettings` (validate everything, then one transaction under an advisory lock: write only what changed, one history row each). `controllers/settings.controller.ts`, `routes/settings.ts`, two routes added to `routes/admin.ts`. Logs the changed keys, never the texts.
- **Frontend:** `pages/AdminSettings.tsx` (the Settings tab); `stores/settings.ts` and `components/AppSettings.tsx` (fetched at start and on every session change, applied without waiting); `components/AnnouncementBanner.tsx` in the tab layout; the tagline on Welcome; the palette in `index.css` as `data-accent` blocks (the server picks a name, the CSS picks the colours); `lib/appSettings.ts` mirrors the server's rules. `hooks/useForbiddenEndsAdmin.ts` is shared by all three tabs.
- **Docs:** `tables` (tables 9 and 10; ten tables), `frontend screens` (the Settings tab and how settings apply) (.md + .docx); CLAUDE.md §6.
- **Tests:** backend 466 (98.1% lines over both suites), frontend 317 (99.0%), E2E 23 (new: an admin changes all three settings; a friend sees the banner and a signed-out visitor the tagline — Chromium only, because the settings are global, and it restores the defaults). Missing API-module tests for `chooseGooglePhoto` (Step 2.4) and `api/admin.ts` (Step 2.8) were added here too.

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

You need an admin account — see Step 2.8 for the one-line `UPDATE`. Open `http://localhost:5173/` at 375px width.

1. **Profile** → **Admin area** → **Settings**. Save is disabled; "No changes yet."
2. Type a banner text, turn the switch on, pick **Green**, change the tagline → **Save changes** → "Settings saved". The app turns green at once and the three changes are listed.
3. In another browser, sign in as a normal user → the banner is at the top; dismiss it → it stays gone after a reload.
4. Sign out → Welcome shows the new tagline, in green, and no banner.
5. Turn the switch on with empty text, or clear the tagline → the message under the field, Save disabled.
6. Put things back: switch off, **Purple**, **Reset to default**, **Save changes**.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npm run test:integration -- settings
cd backend && npx vitest run src/services/appSettings.test.ts
cd frontend && npm run test:unit                          # AdminSettings, AnnouncementBanner, AppSettings
npm test --prefix e2e                                     # 23 runs (+1 skipped), needs Docker Postgres
```

---

## Phase 3 — The Magic Feature (UC-11, UC-18 + Playwright)

> **Phase 3 complete (2026-10-05):** Steps 3.1 (posts and the feed), 3.5 (deleting a post) and 3.4 (the backend image) are merged.

> **Re-sliced 2026-10-04.** The original Steps 3.1–3.7 split Phase 3 by layer (schema, scraper, create route, Dockerfile, delete route, all feed UI, E2E), and most of them could not merge alone under CLAUDE.md §11. They became three PRs, each with its own spec session — see `docs/features/posts-feed.md` §0. The original step numbers are kept so references stay valid.

### Step 3.1 — Posts: share a link and see the feed (Phase 3 — UC-11)

Status: ✅ Done
Branch: feat/posts-feed
Spec: docs/features/posts-feed.md

Goal: A member pastes a song or album link from any supported service, the server converts it through squigly.link while a designed spinner runs, and every member sees the post with one button that opens it in their own service. If squigly.link is down, the post is saved with the original link and its author can retry. Absorbs former 3.1, 3.2, 3.3 and most of 3.6.

Tasks:

- [x] Spec: docs/features/posts-feed.md written and approved (re-slice of Phase 3, reject-versus-pending, albums, retry, viewer's-service button, removal deletes posts).
- [x] DB: migration `add_posts` — `posts` with five link columns, `kind`, `source_service`, `conversion_pending`.
- [x] Backend: `services/linkScraper.service.ts` — Chromium with the §7 flags, resource blocking, 8s `waitForSelector`, 12s ceiling including the queue, `p-limit(2)`, browser closed in `finally`; E2E stand-in.
- [x] Backend: `POST` / `GET /api/communities/:id/posts`, `POST /api/posts/:postId/conversion`; removal deletes the member's posts.
- [x] Frontend: composer with the blocking spinner, feed with Load more, `PostCard`, Other services sheet, pending state and retry.
- [x] Review: `/code-review` (2 findings, both fixed — a post finishing after Load more wiped the loaded page; a lost community hid others after Back/Forward) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7, plus the nightly live-site test.

What I did:

Built the magic feature's first slice (UC-11, and UC-14's removal rule) per `docs/features/posts-feed.md`.

- **DB:** migration `add_posts` — `posts` with five link columns (one per `StreamingService`), `source_service`, `kind` (`PostKind`: track or album), `conversion_pending`, `updated_at`; a feed index and a removal index; cascades from the community and the author.
- **Converter:** `services/linkScraper.service.ts` drives squigly.link in headless Chromium (the §7 flags, images/styles/fonts/media blocked, 8 s per wait, browser closed in `finally`), behind `p-limit(2)` and a 12 s ceiling that counts queue time. It reads JSON-LD metadata, maps links by host, and treats every scraped value as untrusted. Three outcomes: converted, `not_found` (squigly's "could not be found" → `422`), unavailable (→ pending). `services/supportedLinks.ts` checks each link's shape before Chromium launches. `linkScraper.standIn.ts` is the E2E stand-in (`E2E_SCRAPER_FIXTURES`, test-only).
- **Backend:** `services/post.service.ts` (create with a `FOR SHARE` membership re-check after the conversion, keyset-paginated feed, the author's retry), `controllers/post.controller.ts`, `routes/posts.ts` + two routes on `routes/communities.ts`, `utils/publicPost.ts`, `services/postText.ts`. Removing a member deletes their posts in that community, in the same transaction.
- **Frontend:** the community page's placeholder became `components/CommunityFeed.tsx`: a composer (`PostComposer.tsx`) with the blocking "Finding this track on other services…" state, `PostCard.tsx` ("Open in {your service}", Other services sheet, pending state with "Find on other services"), Load more, and the loading, empty, error and offline states. `lib/supportedLinks.ts` and `lib/postText.ts` mirror the server's rules; `api/posts.ts`.
- **Found along the way:**
  - Live probes showed squigly converts as soon as a link is filled in, and that "couldn't reach" is not a not-found answer.
  - `/code-review`: a post finishing during Load more wiped the loaded page, and a lost community hid other communities after Back/Forward.
  - The ceiling test: a queued attempt launched Chromium just before its own timeout. It is now skipped when under 2 s remain.
- **Docs:** `tables`, `use cases` (UC-11, UC-14), `frontend screens` (3.1, 3.3), `link converter implementation guide` (new Phase 0.5), `tech stack`, `tests` (.md + .docx; `tests.docx` also gained its missing Google stand-in paragraph); CLAUDE.md §7; the Phase 3 re-slice above.
- **Dependencies:** `playwright` 1.63.0 (pinned to the E2E package's version) and `p-limit` 7.3.3.
- **Tests:** backend 585 (98.3% lines over both suites), frontend 412 (98.8%), E2E 27 + 3 skipped (new: a member shares a link and a friend on another service opens it in theirs; an outage still saves the post — in Chromium and iPhone WebKit; the live squigly.link test runs nightly only).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

The dev backend uses the real squigly.link. Chromium is already installed if you have run the E2E suite; otherwise run `npx playwright install chromium` once in `backend`. Use two Google accounts with different preferred services (for example A on Apple Music, B on Spotify), with B in A's community (see Step 2.2). Open `http://localhost:5173/` at 375px width.

1. As A, open the community → the composer and "Share the first song".
2. Paste `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` → **Post** → the "Invalid link…" message right away, with no request sent.
3. Paste `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`, type a comment, **Post** → about 2 s of "Finding this track on other services…" → the card shows the Queen cover, "Bohemian Rhapsody - Remastered 2011", the comment, and **Open in Apple Music**. **Other services** lists all five.
4. As B, open the community → the same post, opening **in Spotify**.
5. As A, paste `https://open.spotify.com/track/0000000000000000000000` → after about 9 s the post appears as "Shared from Spotify · Other services unavailable" with **Find on other services**. B sees no retry button.
6. As A, paste `https://music.apple.com/us/album/bohemian-rhapsody/1440650428?i=1440650711` (an id that does not exist) → the "Invalid link…" message, and the link is still in the field.
7. As A, **Settings** → **⋯** next to B → **Remove from community** → the confirmation now adds "Their posts in this community will be deleted too."

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/linkScraper.service.test.ts src/services/supportedLinks.test.ts src/services/post.service.test.ts
cd backend && npm run test:integration -- posts
cd frontend && npm run test:unit                          # CommunityFeed, PostComposer, PostCard, supportedLinks
npm test --prefix e2e                                     # 27 runs (+3 skipped), needs Docker Postgres
RUN_LIVE_E2E=1 npx playwright test posts -g live --project chromium   # in e2e/: the real squigly.link
```

---

### Step 3.2 — _(merged into Step 3.1)_ Playwright link scraper service

The scraper ships with the screen that shows its output — see Step 3.1.

---

### Step 3.3 — _(merged into Step 3.1)_ Post-creation route

See Step 3.1.

---

### Step 3.4 — Backend Dockerfile (Phase 3)

Status: ✅ Done
Branch: chore/backend-dockerfile
Spec: docs/features/backend-docker.md

Goal: `backend/Dockerfile` based on `mcr.microsoft.com/playwright` builds and runs the API with Chromium available.

Tasks:

- [x] Spec: docs/features/backend-docker.md written and approved (Playwright 1.63.0 base, migrate on start, `test:docker` in `main.yml`).
- [x] Infra: multi-stage `backend/Dockerfile` (non-root `pwuser`, `tini` as PID 1, `HEALTHCHECK`), `backend/.dockerignore`; `prisma` moved to `dependencies`.
- [x] Infra: smoke-tested locally — migrations on an empty database, health 200, one real conversion inside the container, graceful stop.
- [x] CI: `test:docker` job in `main.yml`.
- [x] Review: `/code-review` (clean) and `/security-review` (clean).
- [x] Tests: the existing suites stay green; `test:docker` runs the smoke test in CI after merge.

What I did:

Built the backend's deployment unit per `docs/features/backend-docker.md`. No application code changed.

- **Image:** `backend/Dockerfile` is a multi-stage build on `mcr.microsoft.com/playwright:v1.63.0-noble` (Ubuntu 24.04, Node 24, Chromium pinned to our Playwright 1.63.0) — replaced on 2026-10-11 by `node:24.21.0-bookworm-slim` with Chromium's headless shell only, user `node` (Step 6.3a). The runtime stage holds production dependencies, `dist/` and the Prisma migrations only. It runs as the non-root `pwuser`, with `tini` as PID 1, and its start command is `prisma migrate deploy && exec node dist/index.js`. A `HEALTHCHECK` calls `/api/health`. `backend/.dockerignore` keeps `.env` and build output out of the context.
- **Dependencies (approved):** `prisma` moved from `devDependencies` to `dependencies` (same version), because the container migrates; `tini` installed in the image.
- **CI:** `test:docker` in `main.yml` (after merge and nightly, not on PRs). It builds the image, runs it against an empty Postgres, waits for health, proves the migrations through `/api/settings`, checks for a graceful stop with exit code 0, and fails on any error-level log line.
- **Smoke-tested locally:**
  - all 8 migrations applied to an empty database
  - health and settings answer
  - `pwuser`, with tini as PID 1
  - one real squigly.link conversion inside the container (2.8 s, five links)
  - a graceful stop with exit code 0
  - a stand-in refused under production
  - a missing `DATABASE_URL` named by Prisma
- **Measured for Phase 6:** image 2.85 GB; about 83 MB of memory idle and about 234 MB at the peak of a conversion.
- **Docs:** `deployment` (new §3.5, the migrations checklist item), `tech stack` (Docker), `tests` (§4.2 table) (.md + .docx); CLAUDE.md §2, §3 and §10; `posts-delete.md` Merged ticked.
- **Tests:** no new test files (no application code). Backend 599 (98.3%), lint, typecheck and build all green; `test:docker` is the image's own test.

How to view & test:

You need Docker Desktop running and the local Postgres up (`docker compose up -d`). The base image is about 2.5 GB on first pull.

```bash
docker build -t bookrough-api backend
docker exec bookrough-postgres psql -U bookrough -d postgres -c "CREATE DATABASE music_app_docker_smoke"
docker run --rm --name api-smoke -p 4500:4000 -e DATABASE_URL=postgresql://bookrough:bookrough@host.docker.internal:5433/music_app_docker_smoke -e JWT_SECRET=local-smoke-only-secret-value-long-enough-for-validation -e GOOGLE_CLIENT_ID=smoke.apps.googleusercontent.com -e CORS_ORIGIN=http://localhost:5173 bookrough-api
```

1. The logs list the 8 migrations being applied, then "API listening".
2. Open `http://localhost:4500/api/health` → `{"status":"success",…}`; `http://localhost:4500/api/settings` → the default settings.
3. In another terminal, run `docker exec api-smoke whoami` → `node` (it was `pwuser` until the slim image of 2026-10-11, `docs/features/deployment-storage.md`).
4. Press Ctrl+C → "Shutting down" and a clean exit.
5. Clean up: `docker exec bookrough-postgres psql -U bookrough -d postgres -c "DROP DATABASE music_app_docker_smoke"` and `docker rmi bookrough-api`.

Tests:

```bash
cd backend && npm run test:coverage                       # still green with prisma as a runtime dependency
# test:docker runs in CI (main.yml) after the merge, and nightly
```

---

### Step 3.5 — Delete a post (Phase 3 — UC-18)

Status: ✅ Done
Branch: feat/posts-delete
Spec: docs/features/posts-delete.md

Goal: The original author deletes their post from the feed's context menu, with UC-18's confirmation, and the community's admins and owner can delete any post there; later ratings cascade with it. Absorbs former 3.5 and the delete menu of 3.6.

Tasks:

- [x] Spec: docs/features/posts-delete.md written and approved (the author, plus the community's admins and owner on any post; server-computed `canDelete`).
- [x] Backend: `DELETE /api/posts/:postId` (author, or an admin/owner of the community, on any post); `PublicPost.canDelete`.
- [x] Frontend: ⋯ menu on post cards with UC-18's confirmation (admin wording for someone else's post); the feed drops deleted posts.
- [x] Review: `/code-review` (1 finding, fixed — a 403 message was lost when the feed reloaded) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built deleting a post (UC-18, extended with an admin path) per `docs/features/posts-delete.md`.

- **Backend:** `deletePost` in `services/post.service.ts` lets the author delete their post, and lets an admin or the owner of the post's community delete any post there, whoever wrote it. A non-member gets 404, a plain member 403, and a post already deleted 404. `DELETE /api/posts/:postId` in `controllers/post.controller.ts` / `routes/posts.ts`. `PublicPost.canDelete` is computed by the server from the viewer's role, so the client never mirrors the rule. No schema change.
- **Frontend:** a ⋯ "Post options" menu on cards with `canDelete`, expanding to **Delete post**. A confirmation sheet uses UC-18's wording for your own post and "Delete {author}'s recommendation? … {author} won't be notified." for someone else's. "Deleting…", then the toast "Post deleted", and the card leaves the feed from whichever list held it. A network failure shows UC-18's error in the sheet; a post already gone disappears quietly; a 403 is toasted and the feed reloads. Delete is disabled offline. `api/posts.ts` `deletePost`.
- **Found along the way:** `/code-review`: a 403 shown inside the sheet was lost, because the feed reload unmounted the card and its sheet. It is now a toast.
- **Docs:** `use cases` (UC-18: the admin path, its confirmation, already-deleted posts) and `frontend screens` (3.1, the menu) (.md + .docx); `posts-feed.md` (`canDelete`, Merged ticked).
- **Tests:** backend 599 (98.3% lines over both suites), frontend 423 (98.9%), E2E 29 + 3 skipped (new: a member deletes their own post and the owner deletes a member's, gone for both — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts: A owns a community, B is a member (see Step 2.2). Open `http://localhost:5173/` at 375px width.

1. As B, share two links (see Step 3.1). The ⋯ appears on B's posts only. On A's posts there is no ⋯.
2. As B, **⋯** → **Delete post** → "Are you sure you want to delete this recommendation? …" → **Delete** → "Post deleted", and the card is gone.
3. As A, reload → B's deleted post is gone; the ⋯ appears on every post. **⋯** on B's other post → **Delete post** → "Delete {B}'s recommendation? … {B} won't be notified." → **Delete**.
4. As B, reload → that post is gone too.
5. Go offline (DevTools) → **⋯** → **Delete post** is disabled.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/post.service.test.ts src/utils/publicPost.test.ts
cd backend && npm run test:integration -- posts
cd frontend && npm run test:unit                          # PostCard, CommunityFeed
npm test --prefix e2e                                     # 29 runs (+3 skipped), needs Docker Postgres
```

---

### Step 3.6 — _(split across Steps 3.1 and 3.5)_ Community Feed UI

The feed, composer and cards are Step 3.1; the delete menu is Step 3.5.

---

### Step 3.7 — _(dissolved)_ Phase 3 E2E coverage

Every feature ships its own E2E (CLAUDE.md §15). The live-site test gated on `RUN_LIVE_E2E` arrives with Step 3.1.

---

## Phase 4 — Engagement & Feedback (UC-12, UC-13, UC-16)

> **Phase 4 complete (2026-10-05):** Steps 4.1 (bookmarks and My List), 4.2 (rating, with the 4.3 stub) and 4.4 (Post Detail) are built; 4.4 merges with its PR.

> **Re-sliced 2026-10-05.** The original Steps 4.1–4.5 split Phase 4 by layer (schema, routes, notification stub, all UI, tests), and none of them could merge alone under CLAUDE.md §11. They became three PRs, each with its own spec session — see `docs/features/bookmarks-my-list.md` §0. The original step numbers are kept so references stay valid.

### Step 4.1 — Bookmarks and My List (Phase 4 — UC-12, UC-13's list)

Status: ✅ Done
Branch: feat/bookmarks-my-list
Spec: docs/features/bookmarks-my-list.md

Goal: A member saves a friend's post from the feed with the bookmark icon, and finds it on the My List tab, which opens it in their own service and lets them remove it. Bookmarks are private and outlive leaving or removal. Absorbs the bookmark halves of former 4.1, 4.2 and 4.4.

Tasks:

- [x] Spec: docs/features/bookmarks-my-list.md written and approved (re-slice of Phase 4, bookmarks survive leaving and removal, not on your own posts, private).
- [x] DB: migration `add_bookmarks` — `bookmarks` with a composite key, a My List index and a `post_id` index; cascades from the post and the user.
- [x] Backend: `PUT` / `DELETE /api/posts/:postId/bookmark`, `GET /api/users/me/bookmarks`; `PublicPost.isBookmarked`.
- [x] Frontend: the bookmark icon on `PostCard` (optimistic, with rollback), the My List screen replacing Coming soon.
- [x] Review: `/code-review` (clean) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built saving a post to Listen Later and the My List screen (UC-12, and UC-13's list without rating) per `docs/features/bookmarks-my-list.md`.

- **DB:** migration `add_bookmarks` — `bookmarks` (`user_id`, `post_id`, `created_at`), composite primary key, an index for My List (newest saved first) and one on `post_id` for the cascade when a post is deleted. Both foreign keys cascade.
- **Backend:**
  - `services/bookmark.service.ts`: saving needs current membership and someone else's post (`403` "You can't save your own post."); saving and removing are idempotent; removing needs no membership; My List is keyset-paginated with the feed's cursor format.
  - `controllers/bookmark.controller.ts`, routes on `routes/posts.ts` and `routes/users.ts`, and `utils/savedPost.ts` (field by field).
  - `PublicPost.isBookmarked`: `postInclude(viewerId)` reads only the viewer's own bookmark, so no other user's bookmark or count is ever read.
- **Frontend:**
  - `components/BookmarkButton.tsx` on `PostCard` (not on your own posts): optimistic, reverting with UC-12's message on failure; a `404` toasts "This post is no longer available." and reloads the feed. The feed records the change against the latest state.
  - `pages/MyList.tsx` and `components/SavedPostCard.tsx` replace the tab's Coming soon: "Shared by … in …" (a link while you are a member), "Open in {your service}", optimistic Remove, Load more, and the loading, empty, error and offline states.
  - `CoverArt` and `BookmarkIcon` moved to `components/ui/`; `api/bookmarks.ts`; `lib/bookmarkCopy.ts`.
- **Decisions (Stage 1):** bookmarks survive leaving **and** removal (UC-14 amended); no bookmarking your own post; bookmarks are private.
- **Found along the way:**
  - The bookmark table needs its own `post_id` index: the primary key starts with `user_id`, so it can't serve the cascade when a post is deleted.
  - The auto-mode safety check blocks putting a dev session token into the browser, so the 375px check ran with the developer's own Google sign-in instead.
  - Stage 4: the first version of the feed's concurrency test passed even with the fix removed, because it asserted while the save was still in flight. It now waits for the save to settle.
- **Docs:** `tables` (bookmarks), `use cases` (UC-12; UC-14's removal keeps saved songs), `frontend screens` (3.1 the icon, 4.1 My List) (.md + .docx); the Phase 4 re-slice above; `backend-docker.md` Merged ticked.
- **Tests:** backend 632 (98.4% lines over both suites), frontend 448 (98.8%), E2E 31 + 3 skipped (new: a friend saves a post, finds it in My List and removes it, while the author sees no bookmark on their own post — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts: A owns a community, B is a member (see Step 2.2), and A has shared a link (see Step 3.1). Open `http://localhost:5173/` at 375px width.

1. As A, open the community → there is no bookmark icon on A's own posts.
2. As B, open the community → an outline bookmark on A's post. Tap it → it fills and "Added to Listen Later" appears. Reload → still filled.
3. As B, tap the **My List** tab → the song, "Shared by {A} in {community}", **Open in {B's service}** and **Remove**.
4. As B, tap the filled icon in the feed again → "Removed from Listen Later"; My List is empty ("Nothing saved yet").
5. As B, save the post again, then **Settings** → **Leave community** → My List still shows the song, and the community's name is no longer a link. **Remove** still works.
6. Go offline (DevTools) → the bookmark icon and **Remove** are disabled, with the offline banner on My List.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/bookmark.service.test.ts src/utils/savedPost.test.ts src/utils/publicPost.test.ts
cd backend && npm run test:integration -- bookmarks
cd frontend && npm run test:unit                          # PostCard, CommunityFeed, MyList, api/bookmarks
npm test --prefix e2e                                     # 31 runs (+3 skipped), needs Docker Postgres
```

---

### Step 4.2 — Rate a post (Phase 4 — UC-13)

Status: ✅ Done
Branch: feat/rate-post
Spec: docs/features/rate-post.md

Goal: From My List, a member rates a saved song 1–10 with an optional comment; it leaves their list, the feed shows them "You rated n/10", and the author gets the notification stub. A bookmark whose post was deleted is handled (UC-13's fail path). Absorbs the ratings half of former 4.1 and 4.2, all of 4.3, and the rating modal of 4.4.

Tasks:

- [x] Spec: docs/features/rate-post.md written and approved (My List only, current members only, a rating is final, a rated post can't be saved).
- [x] DB: migration `add_ratings` — `ratings`, unique per user and post, with a hand-written score `CHECK`.
- [x] Backend: `POST /api/posts/:postId/ratings` (removes the bookmark in the same transaction), the notification stub, `PublicPost.myScore`, `409` on saving a rated post.
- [x] Frontend: Rate & Review on My List, the rating sheet, "You rated n/10" on feed cards.
- [x] Review: `/code-review` (clean) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built rating a saved song (UC-13, with former Step 4.3's notification stub) per `docs/features/rate-post.md`.

- **DB:** migration `add_ratings` — `ratings` (`score` SMALLINT, optional `comment`, `created_at`), unique on `(post_id, user_id)`, indexed on `user_id`, cascading from the post and the rater. A hand-written `CHECK` `ratings_score_range` keeps the score between 1 and 10 (recorded in CLAUDE.md §6, since Prisma cannot see it).
- **Backend:**
  - `services/rating.service.ts`: a current member rates someone else's post (`404` for a non-member, `403` for your own post, `422` for a bad score or comment, `409` for a second rating). The rating and the deletion of the rater's bookmark happen in one transaction.
  - `services/ratingNotification.ts`: the stub logs `{ authorId, raterId, postId, score }` only; a failure inside it is logged and never fails the rating.
  - `controllers/rating.controller.ts`, `utils/publicRating.ts`, a route on `routes/posts.ts`.
  - `PublicPost.myScore` reads the viewer's own rating only. Saving a post you rated is `409`.
- **Frontend:**
  - `components/RatingSheet.tsx`: ten scores, an optional comment with the post-comment rules and counter, "Submitting…". A deleted post leaves My List with UC-13's message, a second rating with "You already rated this post."; validation and network errors stay inline with the draft kept.
  - `SavedPostCard`: **Rate & Review**, or "You're no longer in {community}" for a community you left.
  - `PostCard`: "You rated n/10" in place of the bookmark; a save answered `409` toasts and reloads the feed.
  - `api/ratings.ts`, `lib/ratingCopy.ts`.
- **Decisions (Stage 1):** rate from My List only; current members only. Mine: a rating is final in this PR; a rated post can't be saved; the API doesn't require a bookmark.
- **Found along the way:** the rating comment reuses `postText` on both sides rather than a new mirror (the rules are identical).
- **Docs:** `tables` (ratings), `use cases` (UC-13; UC-12's rated case), `frontend screens` (3.1, 4.1, 4.2) (.md + .docx); CLAUDE.md §6 (the `CHECK`); `bookmarks-my-list.md` (Merged ticked, the rated case noted).
- **Tests:** backend 670 (98.5% lines over both suites), frontend 464 (98.8%), E2E 33 + 3 skipped (new: a friend rates a saved song from My List and the feed shows their score — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts: A owns a community and has shared a link, B is a member (see Steps 2.2 and 3.1). Open `http://localhost:5173/` at 375px width.

1. As B, save A's post (the bookmark icon), then open **My List** → the card has **Rate & Review**.
2. Tap it → the sheet with the song, scores 1–10 and a comment. **Submit Rating** is disabled until you pick a score.
3. Pick 8, type a comment, **Submit Rating** → "Rating submitted", and the song leaves My List.
4. Back in the community → the post shows "You rated 8/10" and no bookmark icon. The backend log has one "Rating notification (stub)" line with the ids and the score.
5. As B, save another of A's posts; as A, delete that post; as B, on My List, rate it → "This recommendation is no longer available as the original post was deleted." and the row leaves.
6. As B, save a third post, then leave the community → My List shows "You're no longer in {community}" instead of **Rate & Review**.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/rating.service.test.ts src/services/ratingNotification.test.ts src/utils/publicRating.test.ts
cd backend && npm run test:integration -- ratings
cd frontend && npm run test:unit                          # RatingSheet, MyList, PostCard, api/ratings
npm test --prefix e2e                                     # 33 runs (+3 skipped), needs Docker Postgres
```

---

### Step 4.3 — _(merged into Step 4.2)_ Notification stub on rating

A log line has no screen of its own; it ships with rating — see Step 4.2.

---

### Step 4.4 — Post Detail and feedback (Phase 4 — UC-16)

Status: ✅ Done
Branch: feat/post-detail
Spec: docs/features/post-detail.md

Goal: The average rating on post cards, and a Post Detail screen listing every member's rating, where you can edit your own. Removing a member also removes their ratings in that community. Absorbs the ratings list of former 4.2 and the Post Detail of 4.4.

Tasks:

- [x] Spec: docs/features/post-detail.md written and approved (removal deletes ratings, always visible, edit your own).
- [x] DB: migration `add_rating_updated_at`.
- [x] Backend: `GET /api/posts/:postId`, `GET /api/posts/:postId/ratings`, `PATCH /api/posts/:postId/rating`, `PublicPost.ratingSummary`, removal deletes ratings.
- [x] Frontend: the average and View ratings on cards, the Post Detail screen with Edit, the removal line.
- [x] Review: `/code-review` (clean) and `/security-review` (one note, fixed — My List showed live averages for communities you left).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built Post Detail and rating feedback (UC-16, editing your rating, and UC-14's removal of ratings) per `docs/features/post-detail.md`.

- **DB:** migration `add_rating_updated_at` — `ratings.updated_at`, set on every edit and not shown.
- **Backend:**
  - `PublicPost.ratingSummary` (average and count) on every post: `services/ratingSummary.ts` sums a page in one grouped query, and `utils/ratingSummary.ts` rounds half-up to one decimal in integers (7.25 → 7.3).
  - `GET /api/posts/:postId` (`getPost`), `GET /api/posts/:postId/ratings` (`listPostRatings`, newest first, `utils/publicPostRating.ts`) and `PATCH /api/posts/:postId/rating` (`editRating`: only the keys sent, `404` "You haven't rated this post."). All three require current membership through one helper, `requirePostMember` in `services/communityAccess.ts`, which `ratePost` now uses too.
  - `removeMember` deletes the removed member's ratings in that community in the same transaction as their posts; leaving keeps them.
  - My List sends no live summary for a community you left (the `/security-review` note).
- **Frontend:**
  - `PostCard`: "★ 7.5 · 4 ratings" and **View ratings**; the title links to Post Detail too.
  - `pages/PostDetail.tsx` at `/posts/:postId`: the card, a large average, every rating ("You" on yours, with **Edit**), and the loading, not-found, ratings-failure (UC-16's message with Try again, the card stays) and offline states. Deleting the post from its menu returns to the community.
  - `RatingSheet` gains an edit mode: pre-filled, "Edit your rating", "Save changes", "Rating updated".
  - Community Settings: "Their posts and ratings in this community will be deleted too."
- **Decisions (Stage 1):** removal deletes ratings, leaving keeps them; ratings always visible to members; you can edit your own rating, with no "edited" marker.
- **Found along the way:** `/security-review` noticed My List attached live averages to saved posts from communities the viewer had left, against the members-only rule. It now sends none.
- **Docs:** `tables` (ratings), `use cases` (UC-13, UC-14, UC-16), `frontend screens` (3.1, 3.3, 3.4) (.md + .docx); `communities-membership.md` and `posts-feed.md` (the removal line), `rate-post.md` (Merged ticked, superseded decisions noted).
- **Tests:** backend 710 (98.6% lines over both suites), frontend 482 (98.7%), E2E 35 + 3 skipped (new: the author sees a friend's rating in Post Detail and the friend edits it — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Three Google accounts: A owns a community and has shared a link; B and C are members (see Steps 2.2 and 3.1). Open `http://localhost:5173/` at 375px width.

1. As B and C, save A's post and rate it from **My List** (say 6 and 9) — see Step 4.2.
2. As A, open the community → the card shows "★ 7.5 · 2 ratings" and **View ratings**.
3. Tap **View ratings** → Post Detail: the card, "7.5 out of 10 · 2 ratings", and both ratings newest first with names and comments.
4. As B, open the same Post Detail → B's row reads "You" with **Edit**. Change the score to 9 → "Rating updated"; the average reads 9.
5. As A, **Settings** → **⋯** next to C → **Remove from community** → the confirmation says "Their posts and ratings in this community will be deleted too." → C's rating is gone from Post Detail and the average is B's alone.
6. Open `http://localhost:5173/posts/00000000-0000-4000-8000-000000000000` → the not-found page.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/rating.service.test.ts src/services/ratingSummary.test.ts src/utils/ratingSummary.test.ts src/utils/publicPostRating.test.ts
cd backend && npm run test:integration -- postDetail
cd frontend && npm run test:unit                          # PostDetail, PostCard, RatingSheet, api
npm test --prefix e2e                                     # 35 runs (+3 skipped), needs Docker Postgres
```

---

### Step 4.5 — _(dissolved)_ Phase 4 test coverage

Every feature ships its own tests (CLAUDE.md §15).

---

## Phase 5 — Social Discovery (UC-5, UC-6, UC-7, UC-8)

> **Phase 5 complete (2026-10-06):** Steps 5.1 (find people), 5.2 (friend requests), 5.3 (unfriend) and 5.5 (inviting friends to a community) are built; 5.5 merges with its PR.

> **Re-sliced 2026-10-06.** The original Steps 5.1–5.4 split Phase 5 by layer (schema, routes, all UI, tests), and none of them could merge alone under CLAUDE.md §11. They became three PRs, each with its own spec session — see `docs/features/find-people.md` §0. The original step numbers are kept so references stay valid.

### Step 5.1 — Find people (Phase 5 — UC-5)

Status: ✅ Done
Branch: feat/find-people
Spec: docs/features/find-people.md

Goal: A signed-in user searches the whole directory by part of a display name on the Search tab, and opens a Public Profile — avatar, name, service, and their ratings in communities the viewer is in — from search or from any name already shown. Absorbs the search halves of former 5.2 and 5.3.

Tasks:

- [x] Spec: docs/features/find-people.md written and approved (re-slice of Phase 5, whole directory, shared-community ratings, names link to profiles).
- [x] DB: migration `ratings_by_user_newest` — the ratings user index gains `created_at DESC, id DESC`.
- [x] Backend: `GET /api/users/search?q=`, `GET /api/users/:userId`, `GET /api/users/:userId/ratings`; `redactPath` drops query strings; the request log drops `query`, `params` and `referer`.
- [x] Frontend: the Search screen replacing Coming soon, the Public Profile screen, names linking to profiles on posts, ratings and members.
- [x] Review: `/code-review` (1 finding, fixed) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built finding people and their public profiles (UC-5) per `docs/features/find-people.md`.

- **DB:** migration `ratings_by_user_newest` — the ratings index on `user_id` becomes `(user_id, created_at DESC, id DESC)`, serving a profile's history as well as `myScore` and the account cascade.
- **Backend:**
  - `services/profile.service.ts`: `searchUsers` (the whole directory of onboarded users, matched on the display-name key so case, spacing and accents don't matter; names that start with the query first; at most 20 with `hasMore`; `LIKE` wildcards escaped), `getProfile`, and `listProfileRatings` (the target's ratings only on posts in communities the viewer is in now, keyset-paginated; empty for a stranger).
  - `controllers/profile.controller.ts`; routes `GET /api/users/search`, `/api/users/:userId`, `/api/users/:userId/ratings` after the literal `/users` paths.
  - `utils/profileUser.ts` and `utils/profileRating.ts`, field by field. `ProfileUser` is the first shape that shows another user's preferred service.
  - Logs: `redactPath` drops query strings, `serializeRequest` drops pino-http's parsed `query` and `params`, and the logger removes the `referer` header — a searched name never reaches a log line.
- **Frontend:**
  - `pages/Search.tsx` replaces the tab's Coming soon: searches 300 ms after typing pauses, keeps the query in the URL (Back restores it), newest answer wins; hint, skeleton, UC-5 empty, "first 20", error and offline states.
  - `pages/PublicProfile.tsx` at `/users/:userId`: avatar, name, "Listens on …", and the ratings with Load more, each opening Post Detail; your own id redirects to My Profile.
  - `components/PersonLink.tsx` makes the avatar and name one 44 px link on feed cards and Post Detail (author), Post Detail's ratings, and Community Settings' members. `ComingSoon` deleted.
- **Decisions (Stage 1):** Phase 5 re-sliced into three features; the whole directory is searchable by partial name; the profile shows ratings from shared communities only; profiles open from every name already shown.
- **Found along the way:**
  - Stage 2's browser check showed pino-http still logging `query: { q }` after the URL was redacted; the referer would have leaked the same on a single-origin deployment (and the invite page's token with it).
  - `/code-review`: a query of only accents or joiners got a `422` and an error screen Try again could not clear; it now finds nobody. `/security-review`: clean.
  - Stage 4: the late-answer test was proven to fail with `useRequest`'s guard removed. Tests that reset the auth store under a mounted screen now unmount first, which also cut CommunityFeed's old act warnings from 18 to 5.
- **Docs:** `use cases` (UC-5), `frontend screens` (2.1, 2.2, 2.4), `tables` (ratings index) (.md + .docx); the Phase 5 re-slice above; `post-detail.md` Merged ticked.
- **Tests:** backend 745 (98.7% lines over both suites), frontend 510 (98.7%), E2E 37 + 3 skipped (new: a member finds a friend by part of their name, sees their rating and opens it; a stranger finds them by full name and sees no ratings — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts in one community, as in Step 4.2: A shared a song and B rated it from My List. Open `http://localhost:5173/` at 375px width.

1. As A, tap the **Search** tab and type part of B's name in any case → B appears; your own name, if it matches, reads "· You".
2. Tap B → B's profile: avatar, name, "Listens on …", and B's rating with the song, score, comment and community. Tap it → Post Detail.
3. Go Back twice → the search is still there. Tap the Search tab again → the field empties.
4. On Post Detail, the feed and Community Settings, tap any name → that person's profile (your own → My Profile).
5. Search for something nobody is called (`zzzz`) → "No users found matching this search. Try a different name."
6. As a third account in no shared community, open B's profile → "No ratings to show".
7. Go offline (DevTools) → the search field is disabled with the offline banner.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/profile.service.test.ts src/utils/profileUser.test.ts src/utils/profileRating.test.ts src/utils/redactPath.test.ts
cd backend && npm run test:integration -- profiles
cd frontend && npm run test:unit                          # Search, PublicProfile, PostCard, PostDetail, CommunitySettings, api/profiles
npm test --prefix e2e                                     # 37 runs (+3 skipped), needs Docker Postgres
```

---

### Step 5.2 — Friend requests (Phase 5 — UC-6, UC-7)

Status: ✅ Done
Branch: feat/friend-requests
Spec: docs/features/friend-requests.md

Goal: A user sends a friend request from a Public Profile, and the other accepts or ignores it on a new Friends tab, whose badge counts pending requests and which also lists their friends. Friendships are private. Absorbs former 5.1 (the `friends` table), the request halves of 5.2, and the profile button and Friends screen of 5.3.

Tasks:

- [x] Spec: docs/features/friend-requests.md written and approved (anyone may send, Ignore deletes, Friends tab with a badge, cancel from the profile, private friendships, the picker as Step 5.5).
- [x] DB: migration `add_friends` — `friends` with the hand-written `friends_one_per_pair` index and `friends_not_self` check.
- [x] Backend: send, cancel, accept, ignore, list friends, list and count requests; `friendship` on the profile; the notification stub.
- [x] Frontend: the Friends tab and badge, the Friends screen, the profile's friend button.
- [x] Review: `/code-review` (2 findings, fixed) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built friend requests (UC-6, UC-7) per `docs/features/friend-requests.md`.

- **DB:** migration `add_friends` — `friends` (`requester_id`, `addressee_id`, `status` PENDING / ACCEPTED, `created_at`, `updated_at`), composite primary key, an index on `(addressee_id, status, created_at DESC)` for incoming requests and the badge, both foreign keys cascading. Hand-written: the unique index `friends_one_per_pair` (LEAST / GREATEST of the two ids) and the CHECK `friends_not_self`.
- **Backend:**
  - `services/friend.service.ts`: `sendRequest` (idempotent; sending to someone who asked you accepts theirs; a racing opposite insert is retried through the pair index; a request withdrawn mid-send becomes a plain request), `cancelRequest`, `acceptRequest` (UC-7's message when the sender's account is gone, "no longer available" otherwise), `ignoreRequest` (deletes), `listFriends`, `listRequests`, `countRequests`, `friendshipOf`.
  - `controllers/friend.controller.ts`, `routes/friends.ts` under `/api/friends`; `GET /api/users/:userId` gains the viewer's `friendship`.
  - `utils/friendView.ts` (field by field, `MemberUser` + `since`); `services/friendNotification.ts`, a log-only stub with ids only.
- **Frontend:**
  - A fifth **Friends** tab with a pending-request badge ("9+" above nine), its count in `stores/friendRequests.ts`, refreshed on load and navigation.
  - `pages/Friends.tsx`: Requests (Accept / Ignore) then Your friends, with the loading, empty, error and offline states.
  - `components/FriendButton.tsx` on the Public Profile: Add Friend, Request sent (cancel in a sheet), Respond (Accept / Ignore in a sheet), or a Friends label.
- **Decisions (Stage 1):** UC-9's picker became Step 5.5; anyone signed in may send; Ignore deletes and re-sending is allowed; a Friends tab with a badge; cancel from the profile only; friendships are private.
- **Found along the way:**
  - `/code-review`: sending back while the other person cancelled threw P2025 (a 500); Add Friend that accepted their request left the badge stale. Both fixed. `/security-review`: clean.
  - Stage 4: the withdrawn-request, P2002-retry and badge-refresh tests were each proven to fail with their fix removed.
- **Docs:** `tables` (friends), `use cases` (UC-6, UC-7), `frontend screens` (2.1, 2.3, 2.4) (.md + .docx); CLAUDE.md §6 (the two hand-written objects); `find-people.md` Merged ticked and its §0 pointer; the new Step 5.5.
- **Tests:** backend 784 (98.8% lines over both suites), frontend 537 (98.8%), E2E 39 + 3 skipped (new: one user finds another and sends a request, the other accepts from the badged Friends tab, both see each other — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts, A and B (separate browsers or profiles). Open `http://localhost:5173/` at 375px width.

1. As A, **Search** for B and open B's profile → **Add Friend** → it becomes **Request sent** ("Request sent" toast).
2. Tap **Request sent** → **Cancel request** → back to **Add Friend**. Tap **Add Friend** again.
3. As B, switch tabs → the **Friends** tab shows a badge of 1. Open it → A under **Requests**. Tap **Accept** → "You're now friends with A."; A moves to **Your friends**; the badge is gone.
4. As A, reload B's profile → **✓ Friends**; A's Friends tab lists B.
5. Ignore: as a third account C, send A a request; as A, open C's profile → **Respond** → **Ignore** → **Add Friend**. C's profile of A shows **Add Friend** again.
6. Mutual: C and A each tap **Add Friend** on the other's profile → the second tap makes them friends at once.
7. Go offline (DevTools) → Accept, Ignore and the profile button are disabled, with the offline banner on Friends.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/friend.service.test.ts src/utils/friendView.test.ts
cd backend && npm run test:integration -- friends
cd frontend && npm run test:unit                          # Friends, FriendButton, TabLayout, PublicProfile, api/friends
npm test --prefix e2e                                     # 39 runs (+3 skipped), needs Docker Postgres
```

---

### Step 5.3 — Unfriend (Phase 5 — UC-8)

Status: ✅ Done
Branch: feat/unfriend
Spec: docs/features/unfriend.md

Goal: A user removes a friend, with a confirmation, from the Friends list or the friend's profile. Silent; either may re-request later. Absorbs the unfriend halves of former 5.2 and 5.3.

Tasks:

- [x] Spec: docs/features/unfriend.md written and approved (silent, back to no relation).
- [x] Backend: `DELETE /api/friends/:userId`.
- [x] Frontend: the remove sheet, from the Friends row's ⋯ and the profile's Friends button.
- [x] Review: `/code-review` (1 finding, fixed) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built removing a friend (UC-8) per `docs/features/unfriend.md`.

- **Backend:** `removeFriend` in `services/friend.service.ts` and `DELETE /api/friends/:userId` — deletes only an accepted friendship between the caller and that user, in either direction; pending requests are never touched; silent and idempotent; returns the caller's relation afterwards. No schema change.
- **Frontend:**
  - `components/RemoveFriendSheet.tsx`: "Remove friend?" / "Remove {name} from your friends? They won't be notified." with Remove friend and Cancel; success and failure toasts.
  - `pages/Friends.tsx`: a ⋯ beside each of Your friends opens it; the row leaves on success (kept against the loaded page).
  - `components/FriendButton.tsx`: "✓ Friends" is now a button opening the same sheet; the profile shows whatever relation the server reports.
- **Decisions (Stage 1):** silent, back to no relation; either may re-request later (option A).
- **Found along the way:**
  - `/code-review`: the profile set Add Friend after a removal without reading the server's answer — on a stale profile with a new incoming request, a tap would silently accept it. Fixed, and its test proven to fail without the fix. `/security-review`: clean.
  - The browser pane drops coordinate clicks while the Claude window is minimized; bringing it forward fixed the check.
- **Docs:** `use cases` (UC-8), `frontend screens` (2.3, 2.4), `tables` (friends) (.md + .docx); `friend-requests.md` Merged ticked.
- **Tests:** backend 791 (98.8% lines over both suites), frontend 546 (98.8%), E2E 39 + 3 skipped (the friend loop now ends with the receiver removing the sender, whose profile then offers Add Friend — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts A and B who are friends (see Step 5.2). Open `http://localhost:5173/` at 375px width.

1. As A, open the **Friends** tab → tap **⋯** beside B → "Remove friend?" → **Cancel** → nothing changes.
2. Tap **⋯** again → **Remove friend** → "Removed B from your friends."; B leaves the list.
3. As B, reload A's profile → **Add Friend** (B was not told). Send a request, accept it as A.
4. As A, open B's profile → tap **✓ Friends** → **Remove friend** → the button becomes **Add Friend**.
5. Go offline (DevTools) → the ⋯ buttons and the Friends button are disabled.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/friend.service.test.ts
cd backend && npm run test:integration -- friends
cd frontend && npm run test:unit                          # Friends, FriendButton, api/friends
npm test --prefix e2e                                     # 39 runs (+3 skipped), needs Docker Postgres
```

---

### Step 5.3a — Friend sheets layout (Phase 5, a fix to Steps 5.2 and 5.3)

Status: ✅ Done
Branch: fix/friend-sheets-layout
Spec: none — a layout fix agreed in a short Stage 1 (no behaviour, copy or API change)

Goal: Finding F1 of the 2026-11-04/07 manual test session. In the **Remove friend?** sheet (Friends & Requests / UC-8), the buttons sat right under the question with no gap, and looked cramped. Bring it, and its two siblings, in line with every other confirmation sheet.

What I did:

- **Cause:** the three friend sheets were the only sheets that put their text and buttons straight into `Sheet` with no spacing, and they used a narrow `flex gap-2` row with the primary action first. Delete post, Hide and the Community Settings confirmations all use a `flex flex-col gap-4` column, with a `flex gap-3` row of two `flex-1` buttons, Cancel first.
- `components/RemoveFriendSheet.tsx`: that pattern — **Cancel** | **Remove friend**, equal width; the body text in the standard colour, as on the other sheets.
- `components/FriendButton.tsx`, same problem, same fix: **Friend request** is now **Ignore** | **Accept**; **Request sent** has the spacing and a full-width **Cancel request**.
- **Review:** `/code-review` raised 4 findings. 2 were fixed: a test matched the × glyph instead of the Close label, and temporary verification files needed keeping out of the commit. 2 were left: the button row is now repeated in five sheets, and a shared component would be a wider refactor; and Remove friend has no "Removing…" busy copy, which would be a copy change, out of scope.
- **Verified** at 375px against the dev server: 16px between text and buttons, two 44px-tall buttons of equal width.
- **Tests:** `FriendButton.test.tsx` gains the button order of all three sheets, and Cancel closing Remove friend without removing. Frontend 743 tests, 98.67% lines.

How to view & test:

```bash
docker compose up -d
cd backend && npm run dev
cd frontend && npm run dev
```

Signed in as a user with a friend, open `http://localhost:5173/friends` at 375px width.

1. Tap **⋯** beside a friend → "Remove friend?" shows the question, clear space, then **Cancel** and **Remove friend** side by side at equal width.
2. **Cancel** closes it; nothing changes.
3. On the profile of someone who sent you a request, **Respond** → **Ignore** | **Accept**, same layout; on someone you asked, **Request sent** → a full-width **Cancel request**.

Tests:

```bash
cd frontend && npx vitest run src/components/FriendButton.test.tsx
cd frontend && npm run test:unit                          # 80% floor
```

---

### Step 5.4 — _(dissolved)_ Phase 5 test coverage

Every feature ships its own tests (CLAUDE.md §15); the friend-request E2E belongs to Step 5.2.

---

### Step 5.5 — Invite friends to a community (Phase 5 — UC-9's picker)

Status: ✅ Done
Branch: feat/invite-friends
Spec: docs/features/invite-friends.md

Goal: Admins invite their friends from the Create Community form and the Invite friends panel; the friend accepts or declines on the Friends tab, whose badge counts invitations too. Added 2026-10-06 in Step 5.2's spec session (`docs/features/friend-requests.md` §0).

Tasks:

- [x] Spec: docs/features/invite-friends.md written and approved (accept or decline, on the Friends tab, admins invite).
- [x] DB: migration `add_community_invitations`.
- [x] Backend: candidates, invite, cancel, my invitations, count, accept, decline; the link's accept and removal clear an invitation.
- [x] Frontend: the friends picker on the Create form and in the Invite panel; Invitations on the Friends tab; the combined badge.
- [x] Review: `/code-review` (clean) and `/security-review` (clean).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Built inviting friends to a community (UC-9's picker; UC-7's "invite each other to Communities") per `docs/features/invite-friends.md`.

- **DB:** migration `add_community_invitations` — `community_invitations` (`community_id`, `user_id`, `invited_by_id`, `created_at`), composite primary key, indexes for "my invitations" and the inviter's set-null; cascades from the community and the invitee. The schema is now eleven tables.
- **Backend:**
  - `services/invitation.service.ts`: the picker's candidates (each friend as MEMBER, BLOCKED, INVITED or INVITABLE), inviting (only invitable friends; others skipped silently), cancelling, the invitee's list and count, accepting (the invitation used up and a MEMBER membership created together; a later block wins, unannounced) and declining.
  - `controllers/invitation.controller.ts`; admin routes under `/api/communities/:id/invitations`, invitee routes under `/api/invitations`.
  - The link's accept and member removal now clear a pending invitation. `utils/invitationViews.ts` serialises field by field; `services/invitationNotification.ts` is a log-only stub.
- **Frontend:**
  - `components/FriendPicker.tsx`: checkboxes on the Create form (replacing the static card), Invite / Invited (tap to cancel) in the Invite friends panel, with Member and Blocked as labels.
  - `pages/Friends.tsx`: an Invitations section above Requests; Join opens the community, Decline is silent.
  - The Friends badge counts requests plus invitations ("Friends, 3 waiting"). `CommunityCover` gained a `thumb` size.
- **Decisions (Stage 1):** an invitation the friend accepts or declines; shown on the Friends tab; admins invite, from the form and the panel.
- **Found along the way:**
  - When the browser pane closed, the app stopped the dev servers; restarting them finished the check.
  - The link and removal clean-ups were each proven by a test that fails without its line. `/code-review` and `/security-review`: clean.
  - Two older test files opened the Invite panel without mocking the new API and printed network errors; they now mock it.
- **Docs:** `tables` (table 11; eleven tables), `use cases` (UC-9, UC-15's note), `frontend screens` (2.1, 2.3, 3.2, 3.3) (.md + .docx); CLAUDE.md §6; `communities-create.md` (the card superseded); `unfriend.md` Merged ticked; Phase 5 marked complete.
- **Tests:** backend 822 (98.9% lines over both suites), frontend 565 (98.8%), E2E 41 + 3 skipped (new: two users become friends, one creates a community ticking the other, who joins from the Friends tab — Chromium and iPhone WebKit).

How to view & test:

```bash
docker compose up -d
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

Two Google accounts A and B who are friends (see Step 5.2). Open `http://localhost:5173/` at 375px width.

1. As A, **Create community** → under **Invite friends** tick B → **Create** → the Invite friends panel opens with B as **Invited**.
2. As B, switch tabs → the **Friends** badge reads 1 waiting. Open it → under **Invitations**: the community, "A invited you · 1 member". Tap **Join** → you land in the community ("You joined …").
3. As A, open the community's **Invite friends** → B is now **Member**. Invite another friend, then tap **Invited** to cancel it.
4. Remove a member who is also your friend (Settings) → in the panel they show as **Blocked**.
5. As B, ask A for a second invitation and tap **Decline** → it disappears; A's panel shows **Invite** again.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/services/invitation.service.test.ts src/utils/invitationViews.test.ts
cd backend && npm run test:integration -- invitations
cd frontend && npm run test:unit                          # FriendPicker, CreateCommunity, InvitePanel, Friends, TabLayout, api/invitations
npm test --prefix e2e                                     # 41 runs (+3 skipped), needs Docker Postgres
```

---

## Phase 6 — Shipping It

> Feature-complete is not shipped. This phase turns a working local application into something a friend group can actually use, on a phone.
>
> CI moved to Phase 0 (Step 0.5) — a merge gate that arrives at the end has already failed at its job.

> **Manual-test notes added 2026-11-08.** The developer chose to build notes N1–N10 from the manual test session (`docs/manual-tests/2026-11-04.md` §7) before Step 6.2, one feature per PR, as Steps 6.1c onwards. PR #40 (Step 6.2) stays open because its iPhone checks need a Vercel preview, and the team is paused until 2026-11-11. New write controls follow its offline-write pattern so the rebase stays simple. N4 (the onboarding tutorial) comes last, after a UI redesign. The order is now 6.3 → 6.1 → 6.3a → 6.1a → 6.1b → 6.4 → 6.1c → 6.1d → 6.1e → 6.1f → 6.1g → 6.1h → 6.1i… → 6.2 → 6.5.

> **Link-only posts added 2026-11-03** as Step 6.1b, built while PR #40 (Step 6.2) waits on the Vercel pause, an exception to one open PR at a time. The order is now 6.3 → 6.1 → 6.3a → 6.1a → 6.1b → 6.2 → 6.4 → 6.5.

> **UC-20 added 2026-11-02.** Direct recommendations are built as Step 6.1a, before Step 6.2, whose iPhone checks wait for the Vercel pause anyway. The order is now 6.3 → 6.1 → 6.3a → 6.1a → 6.2 → 6.4 → 6.5.

> **Re-sliced 2026-10-10.** The PWA steps' manual checks (a real iPhone, airplane mode, deploying a second build) need a live HTTPS origin, so Phase 6 now ships in this order: **6.3 production deploy → 6.1 PWA installable → 6.2 PWA offline → 6.4 hardening → 6.5 README**. Step numbers are kept so references stay valid. The site is public from 6.3, but its address is not shared with friends until 6.4 merges — see `docs/features/production-deploy.md` §0.

### Step 6.1 — PWA: installable (Phase 6)

Status: ✅ Done
Branch: feat/pwa-installable
Spec: docs/features/pwa-installable.md

Goal: The site installs to an iPhone home screen from Safari and launches full-screen with no browser chrome.

Tasks:

- [x] Spec: docs/features/pwa-installable.md approved (test on the branch preview before merge; probe Google sign-in first; no new dependency; iOS install hint).
- [x] Frontend: `manifest.webmanifest` — name, short_name, start_url, `display: standalone`, theme and background colours.
- [x] Frontend: Full icon set — 192px, 512px (also the maskable entry), the 180px `apple-touch-icon`, and an SVG favicon.
- [x] Frontend: iOS-specific meta tags (Safari does not read everything from the manifest).
- [x] Frontend: iOS install hint on Welcome and the invite preview (spec §5.1).
- [x] Review: `/code-review` (5 findings, all fixed) and `/security-review` (clean).
- [x] Tests: unit, component and contract tests per spec §7; E2E unchanged and green.
- [x] Tests: Manual — the sign-in probe: installed from Safari on a real iPhone, launched from the home screen, signed in with Google inside the app (I2, I3).
- [x] Tests: Manual — the second iPhone round on the preview: I1, I4, I6, I7, I8 ✅, I10 ✅ (`curl`); I5 (rating) and I9 (invite link from Messages) skipped by the developer — rating needs a second account and its code is unchanged; I9 is accepted iOS behaviour.

> `vite-plugin-pwa` moved to Step 6.2 (decided 2026-10-11): installing needs no service worker, and the plugin would have built one a step early.

What I did:

Made BookRough installable to the iPhone home screen, per `docs/features/pwa-installable.md`. No UC of its own: every UC becomes usable from the installed app.

- **Manifest and icons (`frontend/public/`):** a hand-written `manifest.webmanifest` (`BookRough`, `start_url` = `scope` = `id` = `/`, `standalone`, colours from the light `--canvas` token, no `orientation`). Icons are the placeholder vinyl mark on the accent purple: `icons/icon.svg` is the source and the favicon; `icon-192.png`, `icon-512.png` (also the maskable entry, since the mark sits inside the safe zone) and `apple-touch-icon.png` (180) are rendered from it by `frontend/scripts/render-icons.mjs` with the Chromium `e2e/` already installs. No new dependency.
- **`frontend/index.html`:** the manifest link, the SVG favicon, `apple-touch-icon`, and the `apple-mobile-web-app-*` / `mobile-web-app-capable` tags (`status-bar-style: default`). No service worker.
- **Install hint:** `lib/installHint.ts` decides (an iOS browser with a `Safari/` token, not already standalone); `components/InstallHint.tsx` shows "Install BookRough: tap Share (in Safari it's under •••), then Add to Home Screen." on Welcome and the invite preview, dismissible per device. The bar and its storage are now shared with the announcement banner: `components/ui/DismissibleBar.tsx` and `lib/deviceStorage.ts`.
- **Sign-in probe (2026-10-11):** on a real iPhone (iOS 26), installed from the preview: purple icon named BookRough, no address bar, and Google's popup signs in inside the installed app. The redirect fallback (spec §4) was not needed; `google-auth.md` §8 marked resolved. iOS 26 Safari keeps Share under •••, which changed the hint's copy.
- **Second iPhone round (2026-10-11):** the hint shows in Safari and ✕ hides it; inside the installed app no hint, the status bar and bottom navigation are clear, a music-service link leaves the app, and a full relaunch stays signed in. Preview protection was switched back on afterwards.
- **Review:** `/code-review` — no hint in in-app browsers (Instagram, Facebook WebViews cannot install), copy that fits Chrome and Firefox on iOS, the duplicated bar and storage helpers extracted, a byte-identical maskable PNG removed, a redundant script option. `/security-review`: no findings.
- **Docs:** `deployment` §6.1, `frontend screens` (Welcome, Join Community) and `tech stack` (`vite-plugin-pwa` arrives in 6.2), .md + .docx; `google-auth.md` §8; `production-deploy.md` Merged ticked; `.claude/launch.json` gains `frontend-preview` (`vite preview` on 4173).
- **Tests:** frontend 600 (98.76% lines). New: `lib/installHint` (9), `InstallHint` (6), the manifest and `index.html` contract (8 — each proven to fail against a broken file), the `vercel.json` rule for the manifest and icons, and the hint on Welcome and the invite preview. E2E 41 + 3 skipped, unchanged (the `mobile-safari` project now shows the hint and still passes).

How to view & test:

Locally (production build — never judge PWA work on the dev server):

```bash
cd frontend && npm run build && npm run preview
```

Open `http://localhost:4173/` in Chrome → DevTools → Application → Manifest: name BookRough, `standalone`, three icons, no errors; Service workers: none. Welcome itself needs the backend (`cd backend && npm run dev`).

On a real iPhone (spec §3.4, §7):

1. Vercel → `bookrough` → Settings → Deployment Protection → **Require Log In** off → Save. The branch preview's address must be in the OAuth client's **Authorized JavaScript origins**.
2. Safari → `https://bookrough-git-feat-pwa-installable-bookrough.vercel.app` → the install hint shows on Welcome (I1).
3. ••• → Share → Add to Home Screen, **Open as Web App** on → the purple vinyl icon named BookRough (I2).
4. Launch it → no address bar; Continue with Google signs in; onboarding follows (I3). The preview has its own database, so production accounts are not there.
5. Status bar readable in light and dark; bottom navigation above the home indicator (I4). Create a community, post a Spotify link, rate it (I5). Links to music services leave the app (I6). Close and relaunch → still signed in (I7). No hint inside the app; ✕ in Safari hides it for good (I8). An invite link from Messages opens in Safari (I9). Desktop Chrome on the preview: the manifest is `application/manifest+json` (I10).
6. Switch **Require Log In** back on → Save.

After merge: remove the preview address from the OAuth client's JavaScript origins.

Tests:

```bash
cd frontend && npm run test:unit                    # 600 tests, 80% floor
cd frontend && npx vitest run src/lib/installHint.test.ts src/components/InstallHint.test.tsx src/manifest.test.ts src/vercelConfig.test.ts
npm test --prefix e2e                               # 41 runs (+3 skipped), needs Docker Postgres
node frontend/scripts/render-icons.mjs              # only when icon.svg changes
```

---

### Step 6.1a — Direct recommendations between friends (Phase 6 — UC-20)

Status: 🟡 Built and tested; merge waits for the developer's word
Branch: feat/direct-recommendations
Spec: docs/features/direct-recommendations.md

Goal: Two friends can send each other a song directly, with no community in common, with the same link conversion as a post. Community posting behaves exactly as before.

Tasks:

- [x] Spec: docs/features/direct-recommendations.md approved (extend `Post`; one friend per send; a Recommendations screen from Friends; Received and Sent; items stay after unfriending; recipient hides, sender deletes; no admin change).
- [x] Backend: migration `add_direct_recommendations`, one `requirePostAccess` rule, six endpoints.
- [x] Frontend: the Recommendations screen, the send sheet, the Friends row, the badge, Send a song on a friend's profile.
- [x] Review: `/code-review` (10 findings: 6 fixed, 4 skipped) and `/security-review` (no findings).
- [x] Tests: unit, integration, regression, component and E2E per spec §7.

What I did:

Delivered UC-20, per `docs/features/direct-recommendations.md`. UC-11's title no longer mentions a chat.

- **Schema:** `posts.community_id` is nullable; new `posts.recipient_id` and `posts.recipient_hidden_at`, and `users.recommendations_seen_at`. Two hand-written CHECKs, `posts_one_target` and `posts_not_self`. No new table.
- **Access:** `services/postAccess.ts` replaces four separate lookups: a current member of the community, or the two people on a direct item; anyone else gets the same `404`. `services/friendship.ts` holds the friendship checks, including the `FOR SHARE` re-check that runs with the insert, after the conversion.
- **API:** `POST /api/recommendations`, `GET .../received`, `GET .../sent`, `GET .../unseen-count`, `POST .../seen`, `PUT .../:postId/hidden`. Conversion is shared with posting through `prepareSharedLink`. Rating, bookmarks, Post Detail, retry and delete work on direct items, and a new rating or an edit needs current friendship. `PublicPost.direct` is `null` on a community post.
- **Frontend:** `pages/Recommendations.tsx` (Received and Sent), `SendRecommendationSheet`, `HideRecommendationSheet`, and `LinkCommentForm`, now shared with `PostComposer`. `PostCard`, `SavedPostCard`, Post Detail, the Public Profile, the Friends screen and the badge handle direct items.
- **Review:** `/code-review` found the draft lost on Change, a deleted card reappearing after a reload, a stale picker after a refusal, a red key-set test, a fourth copy of the keyset filter and a duplicate constant, all fixed. Skipped: shared list state (it would reshape community screens this PR must leave alone), a server-sent `canRate`, `users.updated_at` moving on mark-seen, and one failed count dropping the whole badge refresh. `/security-review`: no findings.
- **Docs:** `use cases`, `tables`, `frontend screens`, `general`, `system architecture conventions` (.md + .docx); amendment notes in eight feature specs; CLAUDE.md §6, §8, §9, §12; the Phase 6 order and Step 6.2's status here; `HANDOFF.md`.
- **Tests:** backend 930 (98.93% lines over both suites), frontend 659 (98.67%), E2E 43 + 3 skipped, on Chromium and iPhone WebKit.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/` in two browser profiles, with two Google accounts on different preferred services.

1. Make them friends: Search → the other person → Add Friend; in the other browser, Friends → Accept.
2. On the friend's profile tap **Send a song**, paste `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`, add a comment, and tap **Send**. A spinner shows "Finding this track on other services…", then "Sent to {name}".
3. In the other browser, navigate once: the Friends tab shows 1. Open Friends → Recommendations. The song is under Received, with a button for that person's own service, and the badge clears.
4. Tap **Rate & Review** and give it 8. Back in the first browser, Friends → Recommendations → Sent shows the score.
5. Bad paths: send to a stranger through the API (`403`); remove the friend, and the song stays while "You're no longer friends with {name}" replaces Rate & Review; ⋯ → **Hide** takes it out of Received only.

Tests:

```bash
cd backend && npm run test:coverage                      # 930 tests, 80% floor
cd backend && npx vitest run --config vitest.integration.config.ts src/routes/recommendations
cd frontend && npm run test:unit                         # 659 tests, 80% floor
npm test --prefix e2e -- tests/recommendations.spec.ts   # the golden loop
```

---

### Step 6.1b — Link-only posts: Bandcamp, SoundCloud and YouTube videos (Phase 6 — UC-11, amended)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/link-only-posts
Spec: docs/features/link-only-posts.md

Goal: Friends can share music the streaming services don't carry — Bandcamp releases, SoundCloud uploads and sets, and YouTube videos of live sessions — without conversion, in a community or to a friend. Songs shared through YouTube convert exactly as before.

Tasks:

- [x] Spec: docs/features/link-only-posts.md approved after a live test of squigly.link and YouTube oEmbed on 22 links (YouTube rule E + C; Bandcamp, SoundCloud and YouTube videos on a fixed allowlist; metadata fetched server-side, falling back to the platform's name; SoundCloud short links through one checked redirect; `LinkPlatform` + `link_platform`; no embedded player; amend UC-11; built as an exception while PR #40 waits).
- [x] DB: migration `add_link_only_posts` — `LinkPlatform`, `PostKind` `VIDEO` and `SET`, `posts.link_platform`, nullable `source_service`, hand-written CHECKs `posts_one_source` and `posts_link_only_unconverted`.
- [x] Backend: link classification, the metadata fetcher, the YouTube rule, retry.
- [x] Frontend: one platform button on every card, the composer's busy copy, the mirrored link rules.
- [x] Review: `/code-review` (6 findings: 3 fixed in code, 2 fixed in the docs, 1 skipped) and `/security-review` (no findings).
- [x] Tests: unit, integration and component per spec §7; no new E2E.

What I did:

Delivered the amended UC-11 for both posting targets (UC-11 and UC-20), per `docs/features/link-only-posts.md`.

- **The YouTube finding:** squigly.link never matched a live performance to its studio track and never answered "not found" for one. It returned only the video's own YouTube link, while every song converted to all five services. That answer is now the rule: a YouTube result with no other service becomes a video post.
- **Schema:** `posts.source_service` is nullable; `posts.link_platform` (`BANDCAMP` / `SOUNDCLOUD` / `YOUTUBE`) marks a link-only post; `PostKind` gains `VIDEO` and `SET`. Two hand-written CHECKs keep a post converted or link-only, never both, and a link-only post never pending and without service links.
- **Backend:** `services/supportedLinks.ts` classifies Bandcamp (`<artist>.bandcamp.com/track|album/…`), SoundCloud tracks, sets and secret links, `on.soundcloud.com` short links, and `youtube.com/live/<id>`. `services/linkMetadata.service.ts` reads SoundCloud oEmbed, the Bandcamp page's `og:` tags and YouTube oEmbed — fixed hosts, no redirects followed, 4 s per request, a byte cap, untrusted text cleaned — and resolves short links through one checked redirect. `post.service.ts` routes each link (`prepareSharedLink`), applies the YouTube rule (E + C), and makes retry a `409` for link-only posts while a pending YouTube video may become one. The converter now waits up to 1.5 s for a link on another service before reading. `PublicPost` and the profile's rating rows gain `platform`.
- **Frontend:** `lib/postLinks.ts` gives every card one button — "Listen on Bandcamp", "Listen on SoundCloud", "Watch on YouTube" — the platform's name when there is no title, and "Set" / "Video" labels; Other services and Find on other services are hidden. The composer and the Send a song sheet show "Getting the details…" for Bandcamp and SoundCloud. The feed's empty state names the new platforms.
- **Review:** `/code-review` found the early page read (a song could become a video), duplicated text cleaning and needless body reads, all fixed; the missing tech stack entries and CLAUDE.md §6 record, fixed in the docs; a shared card-heading component, skipped (the four call sites differ in truncation, links and the pending note). `/security-review`: no findings.
- **Docs:** `use cases`, `tables`, `frontend screens`, `link converter implementation guide`, `tech stack` (three new runtime services), `general` (.md + .docx); amendment notes in `posts-feed.md`, `direct-recommendations.md`, `post-detail.md`, `bookmarks-my-list.md`; CLAUDE.md §6, §7, §9, §12; `HANDOFF.md`.
- **Tests:** backend 68 files (99.01% lines over both suites), frontend 61 files (98.67%). E2E unchanged.
- **With PR #40:** whichever of the two merges second adds `*.bcbits.com`, `*.sndcdn.com` and `i.ytimg.com` to Step 6.2's album-art cache.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/`, sign in, and open a community (or Friends → Recommendations → Send a song). Paste each link, tap **Post**, and check the card:

| Paste                                                                           | Expect                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `https://khruangbin.bandcamp.com/album/a-la-sala`                               | "Getting the details…", then A LA SALA · Khruangbin · Album · **Listen on Bandcamp**                |
| `https://khruangbin.bandcamp.com/track/fifteen-fifty-three`                     | Fifteen Fifty-Three · Khruangbin · **Listen on Bandcamp**                                           |
| `https://soundcloud.com/forss/flickermood`                                      | Flickermood · Forss · **Listen on SoundCloud**                                                      |
| `https://soundcloud.com/forss/sets/soulhack`                                    | Soulhack · Forss · Set · **Listen on SoundCloud**                                                   |
| A SoundCloud app share (`https://on.soundcloud.com/…`)                          | Stored as the full `soundcloud.com` link, without its `?si=` tracking                               |
| `https://www.youtube.com/watch?v=bVwSZQPjRYE` (KEXP, live)                      | "Finding this track…", then Chanpan - romantic (Live on KEXP) · KEXP · Video · **Watch on YouTube** |
| `https://www.youtube.com/live/QrR_gm6RqCo` (Tiny Desk)                          | Mac Miller: NPR Music Tiny Desk Concert · NPR Music · Video                                         |
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (official video)                  | Converted as before: Never Gonna Give You Up · **Open in {your service}** · Other services          |
| `https://youtu.be/dQw4w9WgXcQ`, `https://music.youtube.com/watch?v=dQw4w9WgXcQ` | Converted as before                                                                                 |
| `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`                         | Converted as before                                                                                 |

Bad paths, each refused inline with the UC-11 message and the draft kept: `https://soundcloud.com/forss` (a profile), `https://khruangbin.bandcamp.com/` (a home page), `https://www.mixcloud.com/…` (not on the allowlist), `https://soundcloud.com.evil.example/forss/flickermood` (a lookalike), `https://khruangbin.bandcamp.com/album/doesnotexist` (Bandcamp answers 404). Then rate, save to My List, open Post Detail and delete a link-only post — all as for any post; its ⋯ menu offers no Find on other services.

Tests:

```bash
cd backend && npm run test:coverage                      # 68 files, 80% floor
cd backend && npx vitest run src/services/supportedLinks src/services/linkMetadata src/services/post.service
cd backend && npx vitest run --config vitest.integration.config.ts src/routes/linkOnlyPosts
cd frontend && npm run test:unit                         # 61 files, 80% floor
```

---

### Step 6.1c — Visible sign-out (Phase 6 — UC-3, manual-test note N8)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/visible-sign-out
Spec: docs/features/visible-sign-out.md

Goal: Sign out from the screen the app opens on, and never by accident.

Tasks:

- [x] Spec: docs/features/visible-sign-out.md approved. A button in the Home header, a "Sign out?" confirmation on Home and My Profile, disabled offline (PR #40's pattern), and Complete Your Profile's link left alone.
- [x] Frontend: `components/SignOutSheet.tsx` (`SignOutSheet` + `SignOutButton`), the Dashboard header, and My Profile wired to the sheet.
- [x] Review: `/code-review` (5 findings, all fixed) and `/security-review` (no findings).
- [x] Tests: component tests per spec §7, plus the E2E `signOut()` helper.

What I did:

Delivered UC-3's confirmation step and a visible entry point, per `docs/features/visible-sign-out.md`. No backend or schema change.

- **Home:** the "Your communities" heading now shares its row with a secondary **Sign out** button. The button shows in every Dashboard state, and the heading truncates first at 375px.
- **`SignOutSheet`:** "Sign out?", with "You'll need to continue with Google to sign back in." The buttons are **Cancel** and **Sign out**, which uses the unchanged `useSignOut`. While signing out it reads "Signing out…" and can't be dismissed. On a failure it stays open to retry. Offline, Sign out is disabled with "You're offline. Connect to sign out.", the same pattern as PR #40.
- **My Profile:** its Sign out button now opens the same sheet. That changes its offline behaviour, as noted in profile-settings.md.
- **Review:** `/code-review` found the E2E helper and the Profile tests still expecting a one-click sign-out, two same-named buttons that tests must scope to the dialog, a comment citing a spec that's only on PR #40's branch, and stale offline wording in two specs. All of these are fixed. `/security-review` found nothing.
- **Docs:** `use cases` (UC-3) and `frontend screens` (2.1 and 4.3), .md + .docx; an amendment note in `profile-settings.md`; this step and the Phase 6 note; `HANDOFF.md`.
- **Tests:** frontend 62 files, 759 tests, 98.68% lines. E2E: `support/flows.ts` `signOut()` now signs out from Home and confirms in the sheet. It runs in `main.yml`, not locally, because the local E2E run uses `music_app_test_db`.
- **With PR #40:** both edit `Profile.tsx`'s sign-out block. On the rebase, keep `SignOutButton` there, because the sheet already applies #40's offline rule.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px width and sign in (OfriChrome or OfriEdge).

1. On Home, **Sign out** sits at the right of "Your communities".
2. Tap it. "Sign out?" opens. Tap **Cancel**, and you're still on Home, signed in.
3. Tap **Sign out**, then **Sign out** in the sheet. Welcome appears.
4. Sign in again, then go to **Profile → Sign out**. The same sheet opens.
5. In DevTools → Network → Offline, open the sheet. Its Sign out is disabled with "You're offline. Connect to sign out.". Go back online, and it enables.

```bash
cd frontend && npx vitest run src/components/SignOutSheet.test.tsx src/pages/Dashboard.test.tsx src/pages/Profile.test.tsx
```

```bash
cd frontend && npm run test:unit
```

### Step 6.1d — Notification center (Phase 6 — UC-21, manual-test notes N1 and N2)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/notifications
Spec: docs/features/notifications.md

Goal: When something concerns you, the Home tab shows a count, and the bell on Home lists who did what. Authors finally hear that their post was rated.

Tasks:

- [x] Spec: docs/features/notifications.md approved, with a new UC-21. Five events (community posts grouped per community while unread, direct recommendations, first ratings, friend requests and accepts, invitations), a bell in the Home header plus a Home-tab badge, per-item read with Mark all as read, and the Friends badge narrowed to pending items. N2 is folded in.
- [x] DB: migration `add_notifications`, which adds `NotificationType`, `notifications`, the hand-written partial unique index `notifications_one_open_group` and the CHECK `notifications_count_positive`.
- [x] Backend: `notification.service.ts` (the writers, list, count, mark read, mark all), the controller, `routes/notifications.ts`, and the five event sites. The four log-only stubs are deleted. The cursor helpers moved to `utils/cursor.ts`.
- [x] Frontend: `api/notifications.ts`, `stores/notifications.ts`, `lib/notificationCopy.ts`, `pages/Notifications.tsx`, the bell on Dashboard, the Home-tab badge, and the narrowed Friends badge.
- [x] Review: `/code-review` (7 findings: 6 fixed in code and spec, 1 fixed in Stage 4) and `/security-review` (no findings).
- [x] Tests: unit, integration, component and E2E per spec §7.

What I did:

Delivered UC-21, the in-app notification center, per `docs/features/notifications.md`.

- **Schema:** one `notifications` table. A reader, a type, an actor, an optional community or post, a `count` for post groups, `updated_at` as the list's order, and `read_at`. Cascades remove a notification with its reader, actor, post or community.
- **Writing:** every event writes after its own commit and never fails because of a notification (`writeSafely` logs a `warn`).
  - A community post fans out to every other member in one raw-SQL statement. `ON CONFLICT` on the partial index grows the member's unread group ("3 new posts in Friday Jazz").
  - A friend request keeps one unread row per sender.
  - Invitations notify only the rows `createManyAndReturn` created.
  - A rating notifies on create only. The row shows the rater's current score, joined at read time.
- **Reading:** `GET /api/notifications?before=`, `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read` and `POST /api/notifications/read-all`, all in tier 4 only.
  - Visibility is filtered on every read: a former member stops seeing a community's posts, a banned user its invitation, and nobody sees a post they can't open.
  - Another user's id, a malformed id or a hidden row is the same `404`.
- **Frontend:**
  - The Home header has a bell next to Sign out, with a count. The Home tab shows the unread count, refreshed on every navigation.
  - `/notifications` lists the newest first. A tap marks a row read and opens the feed, Recommendations, the post, Friends or the profile.
  - The screen has Mark all as read and Load more, plus skeleton, empty, error and offline states (PR #40's pattern).
  - The Friends badge counts only requests and invitations waiting for an answer.
- **Review:** `/code-review` found a request sent again stacking rows, duplicate invitation notices in a race, `markRead` writing before its visibility check, an import cycle between `post.service` and the new service, a stale badge decrement, and spec drift, all fixed. It also found old tests mocking the deleted stubs, fixed in Stage 4. `/security-review` found nothing: the raw SQL is parameterised, and every read and write is scoped to the session user.
- **Docs:** `use cases` (new UC-21, and UC-20 now points to it), `tables` (table 12, so twelve tables) and `frontend screens` (2.6 Notifications, Home's bell and badge, the Friends badge, seventeen screens), all .md + .docx. Also CLAUDE.md §6, §8, §9 and §12, and amendment notes in `rate-post.md`, `friend-requests.md`, `invite-friends.md`, `direct-recommendations.md` and `communities-create.md`.
- **Tests:** backend unit 53 files and 827 tests, plus `routes/notifications.integration.test.ts`. Frontend 64 files, 788 tests, 98.68% lines. E2E: `tests/notifications.spec.ts`. **Integration and E2E weren't run locally**, because both use `music_app_test_db`. They run in CI (`test:integration` in `pr.yml`, `test:e2e` in `main.yml`).

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px. You'll need two accounts in one community, for example OfriChrome in Chrome and OfriEdge in Edge.

1. As OfriEdge, post twice in the shared community.
2. As OfriChrome, the Home tab and the bell show **1**. Open the bell: "**2 new posts** in … · latest from OfriEdge". Tap it, and the feed opens and the count clears.
3. As OfriChrome, save one of those songs, then rate it from **My List**. As OfriEdge, the bell shows "OfriChrome rated … n/10".
4. Send a friend request, a direct recommendation, or a community invitation between the two, and each one appears as a row. Accepting a request tells the sender.
5. **Mark all as read** clears every dot and the badge. In DevTools → Network → Offline, it's disabled with "You're offline. Connect to mark them as read."
6. Remove a member from the community. Their post group for it disappears from the list and the count.

```bash
cd backend && npx vitest run src/services/notification.service.test.ts
```

```bash
cd frontend && npx vitest run src/pages/Notifications.test.tsx src/components/TabLayout.test.tsx src/pages/Dashboard.test.tsx src/api/notifications.test.ts
```

### Step 6.1e — Edit a post's comment (Phase 6 — UC-11 and UC-20 amended, manual-test note N7)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/edit-post-comment
Spec: docs/features/edit-post-comment.md

Goal: An author fixes or adds to their comment in place, and readers can see it changed.

Tasks:

- [x] Spec: docs/features/edit-post-comment.md approved. It covers the comment only, an "· edited" marker, the author only (admins still only delete), and a direct item only while friends.
- [x] DB: migration `add_post_comment_edited_at`, which adds the nullable `posts.comment_edited_at`.
- [x] Backend: `editComment` in `post.service.ts`, `PATCH /api/posts/:postId/comment`, and `commentEditedAt` in `PublicPost`.
- [x] Frontend: `EditCommentSheet`, Edit comment in the ⋯ menu (feed, Post Detail, Sent), and the "· edited" marker.
- [x] Review: `/code-review` (4 findings: 3 fixed, 1 recorded in the spec) and `/security-review` (no findings).
- [x] Tests: unit, integration and component per spec §7. No E2E.

What I did:

Delivered N7 per `docs/features/edit-post-comment.md`.

- **Backend:**
  - `editComment` cleans the comment with the posting rules (`422` when it's too long).
  - It reads the post once for both the access check and the stored text. A non-member or unknown post gets `404`, anyone but the author `403` (admins included), and a direct item after unfriending `403`.
  - It writes only when the cleaned text differs, setting `comment_edited_at`.
  - The response is the same `PublicPost` as the feed's.
  - `profile.service` now takes its cursor helpers from `utils/cursor.ts`, which avoids an import cycle.
- **Frontend:**
  - Edit comment sits above Delete post for the author, and on a direct item only while friends.
  - The sheet is prefilled, shows `n/280`, and Save is disabled while unchanged, too long or offline.
  - Saving shows "Saving…", then the toast "Comment updated".
  - A `422` shows inline. A `403` or `404` toasts, closes and reloads.
  - "· edited" sits beside the time, with the edit time as a tooltip.
- **Docs:** `use cases` (UC-11, UC-20), `tables` (`comment_edited_at`) and `frontend screens` (3.1, 3.4), all .md + .docx. Amendment notes in `posts-feed.md`, `posts-delete.md`, `link-only-posts.md` and `direct-recommendations.md`.
- **Tests:**
  - Backend unit: 53 files, 835 tests.
  - Backend integration: `routes/editComment.integration.test.ts` runs in CI's `test:integration`. It wasn't run locally, because it uses `music_app_test_db`.
  - Frontend: 65 files, 802 tests, 98.61% lines. That includes `EditCommentSheet.test.tsx` and new PostCard and PostDetail cases.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/` at 375px, signed in, on a community with one of your posts.

1. On your post, tap ⋯. **Edit comment** sits above Delete post.
2. Change the text, then tap **Save**. "Comment updated" appears, and the card shows the new text and "· edited".
3. Open it again without changing anything, and Save stays disabled. Clear the text and save: the comment disappears, and "· edited" stays.
4. On someone else's post, an admin's ⋯ has no Edit comment.
5. In DevTools → Network → Offline, Save is disabled with "You're offline. Connect to edit."

```bash
cd backend && npx vitest run src/services/post.service.test.ts
```

```bash
cd frontend && npx vitest run src/components/EditCommentSheet.test.tsx src/components/PostCard.test.tsx src/pages/PostDetail.test.tsx
```

### Step 6.1f — Separate Sign in from Create account (Phase 6 — UC-1 and UC-2 amended, manual-test note N9)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/sign-in-sign-up
Spec: docs/features/sign-in-sign-up.md

Goal: A newcomer knowingly creates an account, and a returning friend knowingly signs in. The wrong choice never makes a stray account or leaves a dead end.

Tasks:

- [x] Spec: docs/features/sign-in-sign-up.md approved.
  - Two intents. Sign in without an account creates nothing and offers Create account in one tap. Create account for an existing account signs in, with a toast.
  - A switch above **one** Google button, because Google's script keeps a single global callback.
  - The decision in CLAUDE.md §5 is reversed.
- [x] Backend: `authenticateWithGoogle(credential, intent?)` and `POST /api/auth/google` with an optional `intent`.
  - `signin` without an account is a `404` with nothing written.
  - Success now returns `created`.
  - An absent `intent` keeps find-or-create, for cached clients.
- [x] Frontend: `GoogleSignIn` has a Sign in / Create account toggle and one `GoogleLogin` whose `text` follows it. It also has the no-account notice (Create account, or Use another Google account) and the "already have an account" toast. Welcome defaults to Sign in, and the invite preview to Create account.
- [x] Review: `/code-review` (4 findings: 3 fixed, 1 in Stage 4) and `/security-review` (no findings).
- [x] Tests: unit, integration, component and E2E.

What I did:

Delivered N9 per `docs/features/sign-in-sign-up.md`, and reversed the "same button" decision in CLAUDE.md §5.

- **Backend:** the token is verified first, as before.
  - `signin` with no account is a `404` "No account for this Google account yet.", with no row and no cookie. It reveals only the caller's own account status.
  - `signup` for an existing account signs in, with `created: false`.
  - The log records `intent`, never the token or email.
- **Frontend:**
  - `GoogleCredentialButton` gains a `text` prop. Only the `GoogleLogin` is keyed by it, so Google's script loads once.
  - `GoogleSignIn` has the two-button toggle (`aria-pressed`), busy copy per intent, and the D2 notice. The notice keeps the credential in memory only. An expired token there says so, and Try again switches to Create account.
  - Welcome uses the toggle. The invite preview reads "Sign in or create an account to join" and starts on Create account.
- **Review:**
  - `/code-review` found that a remount reloaded Google's script on every toggle, the radio role lacked the keyboard model, and Try again after expiry stayed on Sign in. All three are fixed.
  - The old Welcome and InvitePreview tests are updated.
  - `/security-review` found nothing.
- **Docs:**
  - CLAUDE.md §5 and §8, and `auth` (sequence, plus the new intent paragraph), .md + .docx.
  - `use cases` UC-1 and UC-2, and `frontend screens` (group intro, 1.1 Welcome, 3.5 Join Community), .md + .docx.
  - An amendment note in `google-auth.md`.
- **Tests:**
  - Backend unit: 6 new intent cases.
  - Integration: 8 new intent cases in `routes/auth.integration.test.ts`. They run in CI, not locally, because they use `music_app_test_db`.
  - Frontend: 66 files, 812 tests, 98.64% lines. That includes `GoogleSignIn.test.tsx` (10 tests).
  - E2E: the stub button follows Google's `text`. `signIn()` takes an intent, the invite flow uses Sign up, and there's a new auth-flow case: Sign in with a new account, then the notice, then Create account, then Complete Your Profile.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/` signed out, at 375px.

1. Welcome shows **Sign in** (selected) | **Create account**, and below them "Sign in with Google". Tap Create account, and the button reads "Sign up with Google".
2. With **Sign in** chosen and a Google account that has no BookRough account, you see "No account for this Google account yet." Tap **Create account**, and Complete Your Profile opens with no second Google popup.
3. With **Create account** chosen and a Google account that already has one, you see "You already have an account. Signing you in." and land on Home.
4. Open an invite link while signed out. It reads "Sign in or create an account to join", with Create account chosen.

```bash
cd backend && npx vitest run src/services/auth.service.test.ts
```

```bash
cd frontend && npx vitest run src/components/GoogleSignIn.test.tsx src/pages/Welcome.test.tsx src/pages/InvitePreview.test.tsx
```

### Step 6.1g — Tell a member when they're made an admin or the owner (Phase 6 — UC-14 and UC-21 amended, manual-test note N5)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/role-notifications
Spec: docs/features/role-notifications.md

Goal: A member learns from the bell that they were trusted with a community.

Tasks:

- [x] Spec: docs/features/role-notifications.md approved. Notify only (no consent). Notify when made an admin or the owner, and keep a demotion silent.
- [x] DB: migration `add_role_notifications` adds `COMMUNITY_ADMIN` and `COMMUNITY_OWNER` to `NotificationType`.
- [x] Backend: `notifyRole` (one unread row per member, type and community), called by `changeRole` on a real MEMBER → ADMIN, and by `transferOwnership` after the commit. Both types are visible only while the reader is a member.
- [x] Frontend: two rows on the Notifications screen ("Dana made you an admin of …" / "… the owner of …"), each opening the community.
- [x] Review: `/code-review` (2 findings: the tests fixed here, and a rare race recorded in spec §6) and `/security-review` (no findings).
- [x] Tests: unit, integration and component. No E2E.

What I did:

- **Backend:**
  - `changeRole` notifies only when the update changed a MEMBER into an ADMIN. It now also logs only when a row actually changed.
  - `transferOwnership` notifies the new owner once the transaction commits. The old owner gets nothing.
  - The visibility filter gains both types under the membership rule.
- **Frontend:** `NotificationType` gains the two values, and `notificationCopy.ts` has their lines and targets.
- **Docs:** `use cases` UC-14 (role changes notify) and UC-21 (the list of events), and `tables` (the `NotificationType` values), .md + .docx. Amendment notes in `notifications.md` and `communities-membership.md`.
- **Tests:**
  - Backend unit: `notifyRole` create and refresh. In membership, a promotion notifies, while a re-promotion, a demotion and a refused change don't. A transfer notifies, and a failed transfer doesn't.
  - Integration (CI only, `music_app_test_db`): a promotion with the count, a demotion silent with one row after re-promotion, a transfer notifying only the new owner, and removal hiding the row.
  - Component: both new rows' copy and destination.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

Use two accounts in one community (for example OfriChrome as the owner and OfriEdge as a member).

1. As the owner, go to Settings → ⋯ on the member → **Make admin**.
2. As the member, the Home tab shows a count. The bell shows "OfriChrome made you an admin of …", and tapping it opens the community.
3. **Make member** sends nothing. **Make owner** sends "… made you the owner of …".

```bash
cd backend && npx vitest run src/services/membership.service.test.ts src/services/notification.service.test.ts
```

```bash
cd frontend && npx vitest run src/pages/Notifications.test.tsx
```

### Step 6.1h — Upload your own profile photo (Phase 6 — UC-4 and UC-19 amended, manual-test note N10)

Status: ✅ Done (merged as PR #52)
Branch: feat/avatar-upload
Spec: docs/features/avatar-upload.md

Goal: A user replaces the initials circle with their own photo, stored small and safely. The site admin can remove an inappropriate one.

Tasks:

- [x] Spec approved, including the new dependency `sharp` (0.35.5, pinned) and an admin removal recorded as a log line.
- [x] DB: migration `add_user_avatars`.
- [x] Backend:
  - `avatar.service.ts`: signature check, a `sharp` re-encode to 256×256 WebP of at most 100 KB with no metadata, upload, removal and admin removal.
  - `avatar.controller.ts` and the routes: `PUT`/`DELETE /users/me/avatar`, `GET /users/:id/avatar`, `DELETE /admin/users/:id/avatar`.
  - Sign-in keeps an upload. Use generated avatar and re-choosing the Google photo delete it, in a transaction.
- [x] Frontend: `lib/avatarImage.ts` (a centre crop to 512px WebP in the browser), Upload a photo on My Profile, Remove photo on Admin users, and `resolveApiUrl` for photo URLs.
- [x] Review: `/code-review` (6 findings: 5 fixed, 1 documented) and `/security-review` (no findings).
- [x] Tests: unit (real `sharp` on generated images), integration and component. No E2E.

What I did:

- **Reversals:** CLAUDE.md §2, §8 and §17 (one admin write) are updated, and `sharp` is recorded in `tech stack` §5.
- **Storage:** the bytes live in Postgres (`user_avatars`), and only the server's own re-encode is stored. The photo reaches clients through `profile_picture_url`, so no serializer changed.
- **Guards:**
  - A 2 MB cap, and magic bytes rather than headers or names.
  - A 25-megapixel limit, and `failOn: 'error'`.
  - Tier 3 rate-limits the upload (shared with outreach, documented in `production-hardening.md` §3.1).
  - The image is served only to signed-in users, as `image/webp` with `nosniff` and an immutable cache on a versioned URL.
- **A bug found live in Chrome:** in development the API is another origin, so a relative `/api/…` photo URL hit Vite. `Avatar` now resolves it (`resolveApiUrl`); production is one origin.
- **Verified live:** in Chrome, uploading a 1200×800 JPEG with EXIF stored a 2.7 KB 256×256 WebP with no EXIF or ICC. The dev data was restored afterwards.
- **Docs:** `general` §4.1, `tech stack` §5, `frontend screens` (4.3, 5.1, the conventions), `use cases` (UC-4 note, UC-19 scope) and `tables` (`profile_picture_url`, plus table 13, so thirteen tables), all .md + .docx. Also CLAUDE.md, and notes in `profile-settings.md`, `onboarding.md` and `admin-panel.md`.
- **Tests:**
  - Backend unit: 54 files, 870 tests, including `avatar.service.test.ts` (17).
  - Integration: `routes/avatar.integration.test.ts`. It runs in CI, not locally, because it uses `music_app_test_db`.
  - Frontend: 67 files, 828 tests, 97.97% lines.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm install && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Open `http://localhost:5173/profile` and tap **Upload a photo**. Choose a JPEG or PNG under 2 MB, and the avatar becomes the photo, square and centred. The toast says "Photo updated".
2. **Use generated avatar** removes it.
3. As an admin, open `/admin/users`. A row with a photo has **Remove photo**. Confirm it, and the row's photo is gone.
4. Rename a `.txt` file to `.png` and upload it. You get "That file isn't a supported image."

```bash
cd backend && npx vitest run src/services/avatar.service.test.ts
```

```bash
cd frontend && npx vitest run src/pages/Profile.test.tsx src/pages/Admin.test.tsx src/lib/avatarImage.test.ts
```

### Step 6.1i — Discussion threads on a post (Phase 6 — a new UC-22, manual-test note N3)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: feat/discussion-threads
Spec: docs/features/discussion-threads.md

Goal: Friends talk about a song where it's shared. Anyone who can see a post comments on it or replies to a review, and the person replied to hears about it from the bell.

Tasks:

- [x] Spec approved: post comments and review replies (D1), one flat thread per opener (D2), only the person replied to is notified, grouped per post (D3), edit and delete like posts (D4).
- [x] DB: migrations `add_comments` (the table, plus the CHECKs `comments_one_thread` and `comments_body_or_deleted`) and `add_comment_reply_group` (the partial unique index, kept apart because a new enum value can't be used in the transaction that adds it).
- [x] Backend:
  - `comment.service.ts`: list, create, edit and delete, with access through `requirePostAccess`.
  - Writing on a direct item needs friendship. A reply's "to" is checked against the thread.
  - A post comment with replies is hidden, not removed. The thread's opener row is locked while deleting.
  - `notifyCommentReply`: a raw upsert on the partial index.
  - `commentCount` on every post.
- [x] Frontend:
  - `components/Discussion.tsx` and `hooks/useDiscussion.ts`: the composer (n/500), threads, Reply, Edit and Delete, and the offline and unfriended states.
  - "· N comments" on the card, and the `COMMENT_REPLY` notification row.
- [x] Review: `/code-review` (7 findings: 6 fixed, 1 kept as the project's convention) and `/security-review` (no findings).
- [x] Tests: unit, integration, component, and one E2E (`e2e/tests/discussion.spec.ts`).

What I did:

- **Code-review fixes:**
  - Replies under a review that was later emptied stay visible, but take no new replies.
  - Each composer has its own field id.
  - Deletes lock the thread's opener, so a reply inserted meanwhile is never cascade-deleted silently. A reply whose opener vanished gets "That comment is gone."
  - The page's card count follows the discussion.
  - The browser mirrors the server's code-point and character checks.
  - Every reason a post is out of reach gives the same "Comment not found."
- **A11y fix found by the tests:** the form and its field shared one accessible name.
- **Browser check:** not done locally. Claude in Chrome was not connected, and the local E2E harness uses `music_app_test_db`. The new E2E covers the screen in CI on `main`.
- **Docs:** `use cases` (UC-22, and UC-21's list), `tables` (table 14 `comments`, so fourteen tables, and the `NotificationType` value and index) and `frontend screens` (3.1 the card, 3.4 Post Detail), all .md + .docx. Also CLAUDE.md §6, §9 and §12, plus amendment notes in `post-detail.md`, `notifications.md` and `direct-recommendations.md`.
- **Tests:**
  - Backend unit: 55 files, 903 tests, including `comment.service.test.ts` (31) and two `notifyCommentReply` tests.
  - Integration: `routes/comments.integration.test.ts`, run in CI, not locally.
  - Frontend: 850 tests, 97.6% lines.
  - E2E: A posts, B comments, A opens the bell notification and replies.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Sign in as two members of one community. As the first, post a song.
2. As the second, open the post (**View ratings**). Under **Discussion**, type in **Add a comment** and tap **Send**. The comment appears, and the card says "· 1 comment".
3. As the first, the bell shows "… replied to you on …". Open it, tap **Reply** under the comment, and send. The reply joins the thread.
4. Rate the post with a review as the second member. As the first, tap **Reply** under that review.
5. Open a comment's **⋯** menu: **Edit** marks it "· edited". **Delete** on a comment with replies leaves "Comment deleted".
6. Go offline (DevTools → Network → Offline). Send and Reply are disabled with "You're offline. Connect to comment."

```bash
cd backend && npx vitest run src/services/comment.service.test.ts src/services/notification.service.test.ts
```

```bash
cd frontend && npx vitest run src/pages/PostDetail.test.tsx src/components/PostCard.test.tsx src/pages/Notifications.test.tsx
```

### Step 6.1j — UI redesign "Mixtape", slice 1: the foundation (Phase 6 — presentation of existing UCs, UC-19 touched)

Status: ✅ Done (merged as PR #54)
Branch: feat/redesign-foundation
Spec: docs/features/ui-redesign.md (slice 1 of six, §6)

Goal: The building blocks of the Mixtape look exist behind a per-device switch. Everyone still sees the Current design, and nothing changes in what any screen can do.

Tasks:

- [x] Spec approved (2026-11-09; logo amendment 2026-11-10).
- [x] Design switch (§4): `?design=new` / `?design=old` on any URL, stored on the device (`lib/design.ts`, `stores/design.ts`); `components/DesignSync.tsx` sets `data-design="mixtape"` on `<html>` and the `theme-color` metas at runtime. Current stays the default.
- [x] Tokens (§3.1–§3.2) in `index.css`, scoped under `data-design`: canvas, surface, ink, muted, line, the fixed `tape` / `tape-ink` / `sticker` / `sticker-ink`, a static `skeleton` tone, danger re-checked, and Mixtape shades for all five accent names in light and dark. Purple stays the default accent until the swap PR.
- [x] Bricolage Grotesque (`@fontsource-variable/bricolage-grotesque`, approved 2026-11-09) as the Mixtape heading face.
- [x] Kit (§5.0c): `Button` gains the meanings `rating` and `destructive` and an `offline` look (dashed); `ui/field.ts` for text fields; tape-paper toasts (`AppToaster`); `EmptyState`; quiet `LoadError`; static `Skeleton`; `Sheet` with a grab handle, a back arrow for sheets in steps, and a slide that stops under reduced motion.
- [x] Tab bar with the central Share button (§3.4) and the Share sheet (§5.0b, `components/ShareSheet.tsx`): to a community through the existing `PostComposer`, to a friend through the existing `SendRecommendationSheet`.
- [x] `PostCard` (§5.0, `components/PostCardMixtape.tsx`): 116px cover, rating sticker, "You: N" tag, comment on tape, one accent "Open in …" pill, chips, reels while pending, ⋯ as a bottom action sheet. The shared sheets moved to `postCardParts.tsx`, the retry to `hooks/useRetryConversion.ts`.
- [x] `RatingSheet` (§5.10): one row of ten stars, with drag-to-set, arrow / Home / End keys and an "N/10" readout.
- [x] Cassette `CommunityCover` (§3.5), the reel loader (§3.7: `Spinner`, the conversion wait in `LinkCommentForm`), and the logo: `Wordmark` with `hero` and `compact` variants (§3.8). Each screen places the logo in its own slice.
- [x] Review: `/code-review` and `design:accessibility-review` at 375px, light and dark.
- [x] Tests: the existing suite unchanged on the default design, plus the Mixtape tests from spec §8.

What I did:

- **No functionality changes.** The one new UI, the Share button, opens flows that already exist. To put a just-shared post on top when its feed is already open, `Community.tsx` keys the feed on a router-state value the Share sheet sets. `PostComposer` gained `onBusyChange` (so the sheet can't close mid-conversion) and `bare` (no card of its own inside a sheet).
- **Code review** (8 findings, 2 fixed):
  - The mini cassette now fills its 44px slot on Friends.
  - The Share sheet renders outside the tab bar's navigation landmark.
  - Left for the developer, and listed in the PR:
    - Search has no entry under Mixtape until the header icons arrive (slices 2–3).
    - A 404 from the composer returns to a freshly loaded list rather than closing the sheet (the spec wording is ambiguous).
    - Sharing to the feed already open wipes a draft typed in that feed's own composer.
    - Sending to a friend doesn't refresh a Recommendations screen open behind the sheet.
    - The "Create community" pill styling exists twice.
- **Accessibility review:** no critical or major findings; six minor ones:
  - Unfilled stars in `line` are 1.7:1 against the sheet.
  - Tape paper on a white surface in light mode is almost invisible.
  - Light green and pink accent text on `canvas` is 4.45–4.47:1.
  - Post-title links are 22px tall, as today.
  - The star row is the declared 34×44px exception.
  - Focus moves to Close rather than Back between Share steps.

  The developer approved fixing the first two (2026-11-10): unfilled stars now use `muted` outlines, and tape paper gets a 1px `line` ring in light mode (`ui/tape.ts`). The spec is amended in §3.1, §5.10 and §10.

- **Browser check** at 375px, dark and light: Home with cassette covers, the tab bar, all Share sheet steps, and a real post through the sheet (the reels spin, then it lands on top of the feed). Also the post cards with a sticker on Recommendations › Sent, and the ⋯ action sheet. `?design=old` brings back the Current look and its theme colours. The rating sheet was covered by tests only: the dev data has nothing this account can rate.
- **Docs:** `docs/tech stack` .md + .docx — the font in the Fontsource entry (§1, beside the other self-hosted fonts), and the `frontend-design` and `Design` plugins in §5.2.
- **Tests:** frontend 73 files, 927 tests (850 existing, unchanged), 97.8% lines. New:
  - `lib/design.test.ts`, `DesignSync.test.tsx`, `AppToaster.test.tsx`.
  - `ShareSheet.test.tsx`, `PostCardMixtape.test.tsx`, `ui/kit.mixtape.test.tsx`.
  - The Mixtape blocks in `TabLayout.test.tsx` and `RatingSheet.test.tsx`.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Sign in at `http://localhost:5173/`, then open `http://localhost:5173/home?design=new`. The page turns indigo (or lavender in light mode), communities are cassettes, and the tab bar reads Home · Friends · Share · My List · Profile.
2. Tap **Share** → **To a community** → pick one, and paste `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`. Tap **Post**: the reels spin above "Finding this track on other services…", then the feed opens with the post on top.
3. **Share** → **To a friend** opens the existing **Send a song** sheet with its friend picker.
4. On a card, ⋯ opens **Post options** as a bottom sheet; a rated post shows the yellow sticker with its average and count.
5. Open **Recommendations** › Received and use **Rate & Review**: one row of ten stars; tap, drag or use the arrow keys, and the "N/10" readout follows.
6. Open `http://localhost:5173/home?design=old`: the Current look is back on this device.

```bash
cd frontend && npx vitest run src/lib/design.test.ts src/components/DesignSync.test.tsx src/components/ShareSheet.test.tsx src/components/PostCardMixtape.test.tsx src/components/RatingSheet.test.tsx src/components/TabLayout.test.tsx src/components/ui/kit.mixtape.test.tsx
```

```bash
cd frontend && npm run test:unit
```

### Step 6.1k — UI redesign "Mixtape", slice 2: the core loop (Phase 6 — presentation of UC-9, UC-10, UC-11, UC-14, UC-16)

Status: ✅ Done (merged as PR #55)
Branch: feat/redesign-core-loop
Spec: docs/features/ui-redesign.md (slice 2 of six, §6)

Goal: Home, Community Feed, Post Detail, Create Community and Community Settings get the Mixtape look behind the per-device switch. The Current design stays the default and is unchanged, and nothing changes in what any screen can do.

Tasks:

- [x] Two decisions left open by slice 1, settled with the developer (2026-11-10) and recorded in the spec's §5.0b, §7, §8 and §10:
  - Search waits for slice 3 on Friends. Home gets its header icon now.
  - A composer 404 inside the Share sheet keeps the sheet open and returns to the freshly loaded community list. The code already did this; the spec wording was corrected.
- [x] Home (§5.1, `pages/Dashboard.tsx`):
  - Two-row header: the compact logo, Search and the bell; then "Your communities" and Sign out.
  - Cassette cards with "N members · Role" on the label.
  - A dashed "+ Create community" tile ends the list; the floating button is gone.
  - Kit loading, error and empty states.
- [x] Community Feed (§5.2, `pages/Community.tsx`, `components/CommunityFeed.tsx`):
  - "‹ Communities" beside the logo.
  - The banner cassette carries the name as the page's h1.
  - Invite friends and Settings as chips with icons.
  - The composer collapses to a "Share a song or album" pill. It expands in place with focus in the link field. ✕ collapses it and keeps the draft, and a post collapses it.
  - Kit empty state; banner-and-two-posts skeleton.
- [x] Post Detail (§5.3, `pages/PostDetail.tsx`, `components/PostCardMixtape.tsx`, `components/Discussion.tsx`):
  - The card in detail mode: a full-width square cover, a large sticker, and the song title as the h1.
  - "Ratings" heading, with no average block. Rating cards carry a small sticker with the score, and Edit is a chip.
  - "Comments" heading, with the comment composer last.
- [x] Create Community (§5.15): logo, kit fields (`CommunityDetailsFields`), the blank-cassette preview, friends as a `surface` card with accent checkboxes.
- [x] Community Settings (§5.16):
  - "‹ Back" beside the logo.
  - Members grouped into Owner / Admins / Members cards.
  - ⋯ opens a bottom action sheet; the confirmation sheets are unchanged.
  - Delete community is the soft destructive pill.
- [x] Shared pieces:
  - `ui/TopBar.tsx` (logo, back link, `SearchIconLink`).
  - `ui/ActionSheet.tsx`, now also used by the post card's ⋯ menu.
  - `ui/chip.ts` and `ui/LineIcon.tsx`.
  - `CreateCommunityLink.tsx` — the "Create community" pill that existed twice, now one, used by Home and the Share sheet.
  - `CoverArt` gains a `full` size. `CommunityCover` gains `label` and `detail`, so a cassette label can carry real text.
- [x] Review: `/code-review`, `design:accessibility-review` at 375px in light and dark, and a browser check at 375px.
- [x] Tests: the existing suite unchanged on the default design, plus the Mixtape tests from spec §8 for these screens.

What I did:

- **No functionality changes.** Under Current every screen renders as before.
- **Slice 1 leftovers:**
  - Sharing to the feed that is already open used to remount it and lose a draft typed in its own composer. The feed now reloads instead: `CommunityFeed` takes a `refreshKey`.
  - The feed is keyed by community id, so a draft never carries over to another community. This was also true of Back/Forward under Current.
  - `LinkCommentForm` field ids are now unique per form, because the feed's composer and the Share sheet's can be mounted together.
- **Code review** (8 findings, all fixed):
  - A draft carried over to another community after sharing there, and that community's feed was fetched twice (both fixed by the key above).
  - The kit's dashed offline look was missing from comment Send, Save, Leave, Unblock and Create.
  - Home's empty-state title wasn't a heading. The kit `EmptyState` title is now an h2.
  - The cassette link on Home was announced as "Com22 members". An sr-only comma now separates the name.
  - The Mixtape Community page duplicated the whole screen; it now branches only where the look differs.
  - The composer pill had a stale `aria-expanded`.
  - A doc comment on `CommunityCover` was stale.
- **Accessibility review** (note in the session notes folder, `slice2-accessibility-review.md`):
  - Text contrast passes on all five screens in both schemes. Every new control is at least 44×44.
  - Fixed: Post Detail had no h1, and Reply was 37px wide.
  - Left open (minor), and listed in the PR:
    - `line` boundaries on fields, chips and the dashed tile are below 3:1. These are spec token values, and the field is the same as under Current. The developer chose to keep them as specced (2026-11-10).
    - Post-title links are 22px tall, as in slice 1.
    - Action sheets open with focus on Close, as in slice 1.
- **Browser check** at 375px, dark and light, signed in on local dev data:
  - Home: the heading fit was fixed. "Your communities" was clipped by half a pixel; it now has tighter tracking and may wrap rather than clip.
  - The feed: expand, type, ✕, reopen — the draft and focus behave as specified.
  - Post Detail on a rated item; Settings with the member sheet; Create.
- **Tests:** frontend 78 files, 971 tests (927 existing, unchanged), 97.9% lines. New:
  - `pages/Dashboard.mixtape.test.tsx`, `pages/Community.mixtape.test.tsx`, `pages/PostDetail.mixtape.test.tsx`.
  - `pages/CreateCommunity.mixtape.test.tsx`, `pages/CommunitySettings.mixtape.test.tsx`.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Sign in at `http://localhost:5173/`, then open `http://localhost:5173/home?design=new`. Row 1 shows the logo, Search and the bell; row 2 shows "Your communities" and Sign out. Communities are cassette cards, and a dashed **+ Create community** tile ends the list.
2. Open a community. The name sits on the cassette label. Tap **Share a song or album**: the composer opens with the cursor in the link field. Type something, tap ✕, and tap the pill again — the draft is still there.
3. With that draft still open, use the tab bar's **Share** → **To a community** → the same community, and post `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv`. The feed reloads with the new post on top, and your draft is still in the composer.
4. Open a rated post (e.g. **Recommendations** › Sent): a full-width cover with a large sticker, "Ratings" cards with a score sticker, and "Comments" with the box at the end.
5. Open **Settings** on a community you own: members in Owner / Admins / Members cards. ⋯ on a member opens a bottom sheet with that member's actions.
6. **+ Create community**: a grey blank cassette that shows the name as you type.
7. `http://localhost:5173/home?design=old` brings back the Current look.

```bash
cd frontend && npx vitest run src/pages/Dashboard.mixtape.test.tsx src/pages/Community.mixtape.test.tsx src/pages/PostDetail.mixtape.test.tsx src/pages/CreateCommunity.mixtape.test.tsx src/pages/CommunitySettings.mixtape.test.tsx
```

```bash
cd frontend && npm run test:unit
```

### Step 6.1l — UI redesign "Mixtape", slice 3: the social screens (Phase 6 — presentation of UC-4, UC-5, UC-6, UC-7, UC-8, UC-12, UC-20, UC-21)

Status: ✅ Done (merged as PR #56)
Branch: feat/redesign-social
Spec: docs/features/ui-redesign.md (slice 3 of six, §6)

Goal: Friends, Recommendations, Public Profile, Search, Notifications, My List and My Profile get the Mixtape look behind the per-device switch. The Current design stays the default and is unchanged, and nothing changes in what any screen can do.

Tasks:

- [x] One decision settled with the developer (2026-11-10), recorded in the spec's §5.7 and §10:
  - Search rows keep today's content: avatar and name leading to the profile, with no `FriendButton`. The search API returns no friendship state, so a button would be a backend change. It is deferred to its own feature after the redesign.
- [x] Friends (§5.4, `pages/Friends.tsx`):
  - The compact logo, and the header Search icon deferred from slice 2.
  - Recommendations as a tape-paper tile with an envelope and the accent badge.
  - Invitations, Requests and Your friends as `surface` cards labelled in `muted`.
  - Kit empty state with the existing copy and its Search link.
- [x] Recommendations (§5.5): "‹ Friends" beside the logo, and Send a song on its own full-width row. Received / Sent is a pill track (`ui/PillTrack.tsx`) with the selected side on tape paper. Kit empty states.
- [x] Public Profile (§5.6):
  - A tape card with a stripe band in the user's own hue (`ui/ProfileTape.tsx`), the ringed avatar and the name as the h1.
  - `FriendButton` (a secondary pill in every state under Mixtape) and Send a song, half width each.
  - Rating rows with a 64px cover and a score sticker (`ui/ScoreSticker.tsx`, now shared with Post Detail).
- [x] Search (§5.7): a pill field with a leading search icon; results as one `surface` card of divider rows; no results in the kit's dashed frame.
- [x] Notifications (§5.8): "‹ Home" beside the logo and Mark all as read beside the heading. Unread rows are a raised `surface` card with the accent dot and the sr-only "Unread"; read rows lie flat in `muted`, with a muted avatar.
- [x] My List (§5.9, `components/SavedPostCard.tsx`): the post card's shape with a 116px thumbnail and kind tag. Rate & Review is the sticker pill, Open in … the accent pill, and Remove an outlined pill.
- [x] My Profile (§5.11):
  - The avatar section on the profile tape card, with Google's own button.
  - Kit name field (`DisplayNameField`) and service rows with the selected one on tape paper (`StreamingServicePicker`). Both are shared with Complete Your Profile, which gets them under Mixtape now.
  - The Admin area row, and Sign out centred.
- [x] Review: `/code-review`, `design:accessibility-review` at 375px in light and dark, and a browser check at 375px.
- [x] Tests: the existing suite unchanged on the default design, plus Mixtape tests for the seven screens.

What I did:

- **No functionality changes.** Under Current every screen renders as before.
- **Code review** (8 findings; 7 fixed, 1 left for the developer):
  - Text inside the profile tape card used the scheme tokens, so the Google button's "Fetching your photo…" was about 2:1 on tape in dark mode. `ProfileTape` now points `--ink`, `--muted` and `--line` at `tape-ink` for its contents. This works because `@theme inline` utilities read those variables directly. The hand-made tape-ink pill it needed is gone, and Use generated avatar is the kit `Button` again.
  - The selected service row lost its border, so the list jumped by 3px on each choice. Every row now keeps a 1.5px border box.
  - The offline Remove chip relied on CSS order for its opacity. It is now the kit's secondary `Button` with `offline`.
  - Duplication removed: `ScoreSticker` (Post Detail and profile ratings), `OPEN_IN_PILL` and `KIND_TAG` in `ui/chip.ts` (post card and My List), and `MIXTAPE_H1` in `ui/heading.ts`.
  - Left as is: under Mixtape the Friends empty state still says "the Search tab", because the spec allows existing copy only. Listed in the PR for the developer.
- **Kit changes:** `EmptyState` takes an optional heading `level` (an h3 inside the profile's Ratings section) and an optional title (Search's no-results sentence has none). `CoverArt` gains a 64px size, and `StripeBand` is exported from `CommunityCover`.
- **Accessibility review** (`slice3-accessibility-review.md` in the session notes folder): a scripted pass over all seven screens in light and dark found no text below 4.5:1, no control under 44×44, and no unnamed control. Each screen has one h1 and an ordered outline. The one contrast issue had already been found and fixed by the code review. Not exercised live, because the local data had none: requests, invitations, notification rows, saved songs and profile ratings. The component tests cover them.
- **Browser check** at 375px, dark and light, on local dev data: all seven screens with `?design=new`, including the profile tape cards in both schemes.
- **Tests:** frontend 85 files, 1022 tests (971 existing, unchanged), 97.98% lines. New:
  - `pages/Friends.mixtape.test.tsx`, `pages/Recommendations.mixtape.test.tsx`, `pages/PublicProfile.mixtape.test.tsx`.
  - `pages/Search.mixtape.test.tsx`, `pages/Notifications.mixtape.test.tsx`, `pages/MyList.mixtape.test.tsx`, `pages/Profile.mixtape.test.tsx`.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Sign in at `http://localhost:5173/`, then open `http://localhost:5173/friends?design=new`. The logo is top left, the Search icon top right, and Recommendations is a cream tile with an envelope. If you have unseen recommendations, the badge shows on it. Tap the Search icon: it opens Search.
2. On **Search**, type part of a friend's name: one card of rows, each opening the profile.
3. Open a friend's profile: a cream card with a coloured stripe (the same colour as their generated avatar), then **✓ Friends** and **Send a song** side by side.
4. **Friends › Recommendations**: Send a song is a full-width row, and Received / Sent is a track whose selected side is cream.
5. Home's bell → **Notifications**: unread rows are raised cards with a dot, and read rows lie flat and greyed.
6. **My List**: save a song from a feed first. The card shows a 116px cover, a yellow Rate & Review, a coloured Open in …, and Remove.
7. **Profile**: the avatar sits on a cream card. Choose another service: the chosen row turns cream and the list doesn't move.
8. Repeat in light mode. Then open `http://localhost:5173/friends?design=old` to bring back the Current look.

```bash
cd frontend && npx vitest run src/pages/Friends.mixtape.test.tsx src/pages/Recommendations.mixtape.test.tsx src/pages/PublicProfile.mixtape.test.tsx src/pages/Search.mixtape.test.tsx src/pages/Notifications.mixtape.test.tsx src/pages/MyList.mixtape.test.tsx src/pages/Profile.mixtape.test.tsx
```

```bash
cd frontend && npm run test:unit
```

### Step 6.1m — A friend button on each search result (Phase 6 — UC-5, UC-6 and UC-7 amended)

Status: ✅ Done (merged as PR #57)
Branch: feat/search-friend-button
Spec: docs/features/search-friend-button.md

Goal: find someone in Global Search and add them there, without opening their profile first. This was deferred out of the redesign (ui-redesign.md §5.7) because it needs a backend change.

Tasks:

- [x] Stage 1 with the developer (2026-11-10), recorded in the spec's §9:
  - A friend's row shows a quiet "✓ Friends" label, not a button. Removing a friend stays on the profile and the Friends tab (option B).
  - A request you sent is a "Request sent" button with Cancel request in a sheet, as on the profile (option A).
- [x] Backend: `GET /api/users/search` gives each result the viewer's `friendship` (`NONE` / `REQUEST_SENT` / `REQUEST_RECEIVED` / `FRIENDS`). One more query over the ≤20 ids shown: `friendshipsWith` in `services/friendship.ts`. The `relation` rule and the `Friendship` type moved there from `friend.service.ts`, so both share one copy. No schema change.
- [x] Frontend: each row except your own gets `FriendButton` (or the Friends label) beside `PersonLink`. After an action the row takes the server's answer in place, with no new search. An Accept answered 404 searches again. `FriendButton` gains `emphasis="row"`, which makes Add Friend and Respond the accent pill under Mixtape; the profile is unchanged.
- [x] Docs: `use cases.md` and `.docx` (UC-6 pre-condition, trigger and steps; UC-7 trigger), `frontend screens.md` and `.docx` (2.2), and notes in `find-people.md`, `friend-requests.md` and `ui-redesign.md` §5.7.
- [x] Review: `/code-review` and `/security-review`.
- [x] Tests: unit, integration and component, good and bad paths (spec §7).

What I did:

- **Code review** (4 findings):
  - Fixed: the old Search test fixtures had no `friendship` and broke the typecheck. Fixed in the tests.
  - Fixed: a duplicate `Pair` type. It is now exported once from `friendship.ts`.
  - Left as is: when a row's control changes state, keyboard focus drops to the page. The profile's `FriendButton` behaves the same way today; listed in the PR.
  - Left as is, per the spec: an Accept answered 404 reloads the whole search rather than one row.
- **Security review:** no findings. The value is only the viewer's own relation, which their profile already shows. The viewer comes from the session, never from the request, and no relation between two other people is returned.
- **Spec amended in implementation:** no `compact` size for the row button. The kit button is already `text-sm` and 44px tall, and a padding override would fight its own class order in Tailwind 4.
- **Not checked in a browser:** the live flow needs a Google sign-in with two accounts. The component tests cover every row state and action; the manual steps are below.
- **Tests:** backend 77 files, 1415 tests, 98.96% lines (unit and integration together); frontend 85 files, 1032 tests, 97.96% lines. New:
  - `friendship.test.ts`: `relation` and `friendshipsWith`, including no query for an empty list or the viewer alone.
  - `profile.service.test.ts`: the friendship on each result, one query for the 20 shown only, and none for an empty or blank query.
  - `profiles.integration.test.ts`: every relation from either side; no relation between two other people; an ignored request and a removed friend read as NONE.
  - `Search.test.tsx`: each row state; Add Friend, Accept, Ignore and Cancel updating the row in place; a failed send; an Accept answered 404; a new search starting fresh; offline; the Mixtape accent pill. `FriendButton.test.tsx`: `emphasis="row"`.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

You need two Google accounts, or a second user from the dev seed.

1. Sign in at `http://localhost:5173/` and open **Search** (the icon on Home or Friends). Type part of another user's name. A stranger's row shows **Add Friend**; your own row ("· You") shows nothing.
2. Tap **Add Friend**. A "Request sent" toast shows and the row turns into **Request sent** without the list reloading. Tap it: a sheet offers **Cancel request**. Cancel it and the row is **Add Friend** again.
3. Send the request again. In a second browser profile, sign in as that user and search for your name. Your row shows **Respond**. Tap it, then **Accept**: the row becomes the quiet **✓ Friends** label, and the Friends-tab badge drops.
4. Back as the first user, search again: the friend's row shows **✓ Friends** with no button. Removing them is still on their profile.
5. Open `http://localhost:5173/search?design=new` (Mixtape): Add Friend and Respond are the accent pill, Request sent is outlined. `?design=old` brings back the Current look.
6. Go offline (DevTools → Network → Offline): the field and every row's button are disabled.

```bash
cd backend && npx vitest run src/services/friendship.test.ts src/services/profile.service.test.ts
```

```bash
cd backend && npx vitest run --config vitest.integration.config.ts src/routes/profiles.integration.test.ts
```

```bash
cd frontend && npx vitest run src/pages/Search.test.tsx src/components/FriendButton.test.tsx
```

### Step 6.1n — UI redesign "Mixtape", slice 4: entry and admin screens (Phase 6 — presentation of UC-1, UC-2, UC-15, UC-19)

Status: ✅ Done (merged as PR #58)
Branch: feat/redesign-entry-admin
Spec: docs/features/ui-redesign.md (slice 4 of six, §6)

Goal: Welcome, Complete Your Profile, Join Community and Admin get the Mixtape look behind the per-device switch, and Admin gets the switch itself. The Current design stays the default and is unchanged, and nothing changes in what any screen can do.

Tasks:

- [x] Four readings of the spec settled with the developer (2026-11-10):
  - Complete Your Profile: the name cassette sits under the heading, with ♪ while the field is empty (as Create Community's preview).
  - Join Community: the community name moves onto the cassette label as the h1; the separate name line is gone.
  - Admin: the design switch shows under both designs, with one look.
  - The install hint is a tape-paper bar (Welcome and Join Community); the announcement banner keeps the accent.
- [x] Welcome (§5.12): the `hero` logo as the h1, the admin tagline in the display face, no "Spotify link → Apple Music" line. Sign in / Create account is the kit `PillTrack` (selected side on tape paper), above Google's own button.
- [x] Complete Your Profile (§5.13): the compact logo; the cassette with the name as typed, striped in the user's own hue; avatar tiles with the selected one on tape paper.
- [x] Join Community (§5.14): the compact logo; a banner cassette tilted +2°; skeletons; the invalid link in the kit empty state with its existing copy; the dashed offline Join.
- [x] Admin (§5.17): the compact logo; the design switch (`components/DesignSwitch.tsx`) in a dashed frame — "Current" / "Mixtape", local storage only, never the server; section tabs in the pill-track look; Users / Communities as one `surface` card of divider rows; Settings with kit fields, the selected swatch ringed in `ink`, and the history as one card.
- [x] Review: `/code-review`, `design:accessibility-review` at 375px in light and dark, and a browser check.
- [x] Tests: the existing suite unchanged on the default design, plus Mixtape tests for the four screens.

What I did:

- **No functionality changes.** Under Current every screen renders as before; the one addition visible under Current is the design switch on Admin (spec §4).
- **Kit changes:** `PillTrack` takes `disabled` (the sign-in switch offline) and exports `PILL_TRACK` / `pillTrackOptionClass` (the Admin tabs are links, so they reuse the classes). `DismissibleBar` takes `paper` for the tape-paper install hint.
- **Code review** (5 findings; 3 fixed, 2 left):
  - Fixed: Join Community had no h1 while loading or on an error under Mixtape — an sr-only "Join community" until the preview is ready.
  - Fixed: the switch announced its name twice (a heading and the group label with the same words).
  - Fixed: the Admin tabs copied the pill track's classes by hand.
  - Left: the Mixtape branch of Join Community repeats the state ladder, so the Current branch stays byte-identical; the cleanup PR deletes the Current one.
  - Left: the user's cassette is drawn with `CommunityCover` (it takes any id for the hue).
- **Accessibility review** (`slice4-accessibility-review.md` in the session notes folder): a scripted pass over Admin (Users, Communities, Settings) and Join Community (ready, invalid) in light and dark found no text below 4.5:1, no control under 44×44 and no unnamed control. Welcome and Complete Your Profile were not exercised live (they need a signed-out or onboarding session); their colour pairs were measured in earlier slices, and the component tests cover them.
- **Browser check** at 375px, dark and light, on local dev data: Admin with the switch flipped both ways (the `<html>` attribute and local storage change at once), Settings, and Join Community with a real invite link and an invalid one.
- **Tests:** frontend 89 files, 1058 tests (1032 existing, unchanged), 98.01% lines. New: `pages/Welcome.mixtape.test.tsx`, `pages/CompleteProfile.mixtape.test.tsx`, `pages/InvitePreview.mixtape.test.tsx`, `pages/Admin.mixtape.test.tsx`.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. As an admin, open `http://localhost:5173/admin`. Under the heading is a dashed box, "Design on this device", with Current / Mixtape. Tap **Mixtape**: the whole app changes at once, with no reload. Tap **Current** to go back; nothing is sent to the server (DevTools → Network stays quiet).
2. Under Mixtape: the logo is top left, the section tabs have the chosen one in cream, the user list is one card of rows, and Settings shows the selected accent swatch ringed.
3. Open one of your communities, tap **Invite**, copy the invite link and open it: a cream cassette tilted slightly, with the community name on its label. Change the token in the URL to see the invalid-link box with **Go to BookRough**.
4. Sign out (or use a private window with `?design=new`) to see **Welcome**: the big cassette logo, the tagline, then the cream Sign in / Create account switch and Google's button at the bottom. On an iPhone in Safari the install hint is a cream bar.
5. Sign in with a new Google account to reach **Complete Your Profile**: type a name and watch it appear on the cassette; the chosen avatar tile turns cream.
6. Repeat in light mode. `?design=old` brings back the Current look.

```bash
cd frontend && npx vitest run src/pages/Welcome.mixtape.test.tsx src/pages/CompleteProfile.mixtape.test.tsx src/pages/InvitePreview.mixtape.test.tsx src/pages/Admin.mixtape.test.tsx
```

```bash
cd frontend && npm run test:unit
```

### Step 6.1o — UI redesign "Mixtape", slice 5: the swap (Phase 6 — presentation of every UC; UC-19 touched)

Status: ✅ Done (merged as PR #59)
Branch: feat/redesign-swap
Spec: docs/features/ui-redesign.md (slice 5 of six, §6)

Goal: Mixtape becomes the look everyone sees, with the orange accent as the default. The Current design and the Admin switch stay until the cleanup PR (slice 6), so a device can still go back.

Tasks:

- [x] `DEFAULT_DESIGN` → `mixtape` (`frontend/src/lib/design.ts`); `index.html` ships `data-design="mixtape"` and Mixtape's `theme-color` values, so the first paint is already Mixtape.
- [x] Accent default → `orange`: `DEFAULT_ACCENT` (`frontend/src/lib/appSettings.ts`) and `accentColor.defaultValue` (`backend/src/services/appSettings.ts`). A database that stores a choice keeps it.
- [x] Admin switch line: "Only this device. Everyone else sees Mixtape."
- [x] `manifest.webmanifest` colours follow the new default (found in review).
- [x] E2E suite on Mixtape: Search through the header icon, posting from the feed's collapsed composer.
- [x] Docs: `docs/frontend screens` (.md + .docx) — tab bar, Share sheet, Search entry, composer pill, star row; CLAUDE.md §8 records the star-row touch-target exception.
- [x] Review: `/code-review`.
- [x] Tests: the spec §8 backend unit and integration tests for the swap; the full suite green.

What I did:

- **No functionality changes.** Every screen does what it did; only the default look and the default accent change. A device that chose Current (the Admin switch, or `?design=old`) stays on Current until the cleanup PR.
- **First paint:** `index.html` now carries `data-design="mixtape"` and Mixtape's `theme-color` values, and `manifest.webmanifest` Mixtape's light canvas (`#eceaf4`), so a load or an installed-PWA launch no longer shows the Current canvas for a moment. `DesignSync` still swaps both on a Current device.
- **Tests that assumed Current:** `src/test/setup.ts` pins the store to Current before each test, so the Current suites stay that look's regression tests; the `*.mixtape` tests set Mixtape themselves. The default itself is tested in `lib/design.test.ts` (Mixtape with nothing stored; a stored Current kept) and `DesignSync.test.tsx` (the static attribute kept on the default, removed on Current). `manifest.test.ts` now reads Mixtape's canvas.
- **Accent:** backend unit tests for the orange default and a stored purple winning over it; integration tests for `GET /api/settings` on an empty table (`orange`) and with a purple row saved before the swap (spec §8).
- **E2E on Mixtape:** two helpers in `e2e/support/flows.ts` — `openSearch` (Home, then the Search icon in its header) and `openComposer` (the feed's "Share a song or album" pill). Card checks moved to the rating sticker ("★ 8 · 1 rating" opens Post Detail), "You: 8", the "Comments" chip, and score stickers ("8/10"). The admin-settings test now restores `orange`, the default.
- **Docs:** `docs/frontend screens` (.md + .docx): tab bar, Share sheet, Search from the header icon, the collapsed composer, the star row and its touch-target exception. CLAUDE.md §8 records the exception. `ui-redesign.md`: the switch line, the static first paint, a decisions-log row.
- **Code review** (5 findings; 3 fixed, 2 left): fixed — the manifest still had Current's colours; a long line after Prettier; `openSearch` matched any "Search" link instead of the header's. Left — a device on Current briefly paints Mixtape before the script runs (only the admin's device can be on Current; recorded in the spec); the find-people back-link check no longer includes the "←" (Post Detail has one link with that name).
- **CI `secrets`:** gitleaks flagged the slice-4 fake invite token again under PR #58's squash commit on `main` (`e7d2459`); squash-merging re-creates the commit, so the branch fingerprint no longer matched. `.gitleaksignore` gains the squash-commit fingerprint for the same line, under the same approval. A fingerprint added on a branch has to be repeated for its squash commit after the merge.
- **Tests:** frontend 89 files, 1060 tests, 98.01% lines; backend 77 files, 1418 tests, 98.96% lines; E2E 25 tests on Chromium and iPhone 13, green (one local mobile-safari timeout under parallel load passed on rerun).

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Open `http://localhost:5173/` in a private window (nothing stored): Welcome is the Mixtape one, with the big cassette logo. Sign in.
2. Home has the tab bar Home · Friends · **Share** · My List · Profile, and a Search icon beside the bell. Tap it to reach Search; the Friends header has the same icon.
3. Tap **Share** → To a community → pick one → post a link: the sheet closes on the community's feed with the post on top. In the feed itself, tap the "Share a song or album" pill to post from there.
4. If nobody ever saved an accent, buttons and the active tab are orange. An accent saved earlier (say purple) stays.
5. As an admin, `/admin` → the switch line reads "Everyone else sees Mixtape."; tap **Current** to see the old look on this device only (or open any URL with `?design=old`).

```bash
cd backend && npx vitest run src/services/appSettings.test.ts
```

```bash
cd backend && npm run test:integration -- src/routes/settings.integration.test.ts
```

```bash
cd frontend && npx vitest run src/lib/design.test.ts src/components/DesignSync.test.tsx src/components/AppSettings.test.tsx
```

```bash
cd e2e && npx playwright test
```

### Step 6.1p — UI redesign "Mixtape", slice 6: cleanup (Phase 6 — presentation of every UC; UC-19 touched)

Status: 🟡 Built, reviewed and tested; PR open, waiting to merge
Branch: chore/redesign-cleanup
Spec: docs/features/ui-redesign.md (slice 6 of six, §6 — the spec is now marked done)

Goal: Mixtape is the only design. The Current design, the per-device switch and Space Grotesk are gone, so every screen has one code path.

Tasks:

- [x] Tokens: `frontend/src/index.css` holds the Mixtape values on `:root` (light and dark) and the five accent shades on `[data-accent]`; the Current values and the `data-design` selectors are gone.
- [x] Switch removed: `lib/design.ts`, `stores/design.ts`, `DesignSync`, `DesignSwitch` (Admin), `?design=`, and the Current pin in `src/test/setup.ts`. `index.html` drops `data-design`; its static `theme-color` tags are all that is needed.
- [x] Every `useMixtape()` branch folded to its Mixtape side, across 25 pages and components; `PostCardMixtape.tsx` became `PostCard.tsx`, and the Mixtape-only names (`MixtapeDashboard`, `MixtapeNav`, …) became the plain ones.
- [x] Space Grotesk (`@fontsource/space-grotesk`) uninstalled — approved by the developer (CLAUDE.md §11); `docs/tech stack` (.md + .docx) updated (§18).
- [x] PWA icons and apple-touch-icon left as they are — the developer chose a separate feature for redrawing them from the logo.
- [x] Review: `/code-review`.
- [x] Tests: Current-only tests removed, behaviour tests moved onto the Mixtape controls; frontend, backend and E2E suites green.

What I did:

- **No functionality changes.** What everyone has seen since the swap is now the only code: about 2,700 lines of the Current design deleted. The per-device switch on Admin and `?design=` no longer exist; a value a device stored for them (`bookrough.design`) is simply never read.
- **Tokens:** with one design, the `data-design` attribute selected nothing, so the Mixtape tokens moved to `:root` and the accent shades to plain `[data-accent='…']` blocks (any element can still carry one, so the Admin swatches keep their own colour). `index.html` keeps Mixtape's `theme-color` per scheme; no script changes it any more.
- **Font:** `@fontsource/space-grotesk` uninstalled and its import removed from `main.tsx`; the build carries Inter and Bricolage Grotesque only.
- **Tests:** the old Current-era behaviour suites now run against Mixtape. They choose scores on the star radios ("N out of 10"), open the feed's composer pill before posting, find the back links by their plain names, find roles by their group lists ("Owner", "Admins"), and check "You: N" and the rating sticker. Tests that only proved the Current look (the old card's rating line, the old tab bar, the switch) are gone; Mixtape tests already cover the same behaviour. `Dashboard.mixtape.test.tsx` was folded into `Dashboard.test.tsx`; the kit suite is now `ui/kit.test.tsx` and the card's `PostCard.mixtape.test.tsx`. The other `*.mixtape.test.tsx` suites stay beside the behaviour suites, because their mocks differ (decision in the spec's log). A new `manifest.test.ts` check ties both `theme-color` tags to the canvas tokens, replacing what `DesignSync.test.tsx` covered.
- **Docs:** `ui-redesign.md` marked done, §4 marked historical, four decisions-log rows (tokens on `:root`, the font removal, the icons, the test files); `google-auth.md` notes its placeholder identity is superseded; `docs/tech stack` (.md + .docx) Fontsource entry.
- **Code review** (6 findings, all fixed): a dead comment-count override on Post Detail (the card there shows no count); no test tied `theme-color` to the tokens any more; four screens repeated the h1 classes instead of `MIXTAPE_H1`; a lost comment on the invite screen's `defaultIntent="signup"`; a stray blank line; `TILE_FOCUS` folded into `TILE`.
- **Tests:** frontend 86 files, 1035 tests, 97.83% lines; backend 77 files, 1418 tests, 98.96% lines (unchanged code); E2E 26 tests on Chromium and iPhone 13, green. In a local full run, mobile-safari onboarding timed out under parallel load while the backend suites ran alongside; alone with 1 worker, as CI runs it, all of mobile-safari passed.

How to view & test:

```bash
docker compose up -d
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

1. Open `http://localhost:5173/`: Welcome shows the cassette logo, as before. Sign in.
2. Walk Home, a community feed, Post Detail, Friends, My List and Profile: everything looks and works exactly as after the swap.
3. As an admin, `/admin`: the "Design on this device" switch is gone; the section tabs and settings work as before. Adding `?design=old` to any URL changes nothing.
4. Pick another accent on Admin → Settings: buttons and the active tab follow it, in light and dark mode.

```bash
cd frontend && npm run test:unit
```

```bash
cd frontend && npx vitest run src/manifest.test.ts src/components/ui/kit.test.tsx src/components/PostCard.test.tsx
```

```bash
cd e2e && npx playwright test
```

### Step 6.3a — Deployment storage (Phase 6, a fix to Step 6.3)

Status: ✅ Done (post-merge checks S1–S5 in the spec)
Branch: chore/vercel-storage
Spec: docs/features/deployment-storage.md

Goal: Vercel warned that the Hobby team had used 75% of its 10 GB of deployment storage — every kept deployment holds its own 3.12 GB backend image. After this, the worst case is about 3 × 1.2 GB, however often we deploy.

Tasks:

- [x] Spec: docs/features/deployment-storage.md (the developer asked for the safest option and approved the plan in advance, 2026-10-11).
- [x] Infra: `backend/Dockerfile` on `node:24.21.0-bookworm-slim` with only Chromium's headless shell and its libraries; user `node`; `HEALTHCHECK` with Node's `fetch`.
- [x] Infra: `vercel.json` — only `main` deploys; a branch opts in to a preview by its exact name.
- [x] CI: `test:docker` launches Chromium inside the image.
- [x] Review: `/code-review` (3 fixed — Node tag pinned, opt-in fallback documented, stale `pwuser` docs; 2 skipped — layer caching, Node health probe) and `/security-review` (clean).
- [x] Tests: the `vercel.json` contract; local Docker smoke test with a real conversion.

What I did:

No UC of its own: it keeps the deployment every UC runs on inside the free tier.

- **Image:** 2.85 GB → **1.17 GB** (browser and libraries 589 MB, production `node_modules` 345 MB). The browser is installed by the `playwright` package in the lockfile, so there is no image tag to keep in step any more. `openssl` and `ca-certificates` for Prisma.
- **Previews:** `"git": { "deploymentEnabled": { "**": false, "main": true } }`. A branch that needs a preview (Step 6.2's iPhone checks) adds `"<its branch>": true` in its own `vercel.json` and removes it before the merge.
- **One PR, not two:** a previews-only PR would itself have deployed one more 3.1 GB production image.
- **Docs:** `deployment` §3.5–3.6, `tech stack`, `tests`, `link converter implementation guide` (.md + .docx); `CLAUDE.md` §2, §7, §16; `backend-docker.md` superseded notes; `production-deploy.md` — M4 ("no limit") corrected.
- **Follow-up (2026-11-02, `docs/vercel-image-storage`):** the team was paused on 2026-10-12, until 2026-11-11, because Images Storage reached 17.16 of 10 GB. That is a separate meter this step had not tracked. Recorded in the spec's §1.2 and in `deployment`, `tech stack` (.md + .docx), `production-deploy.md` and `HANDOFF.md`; `CLAUDE.md` §16 now requires reading both meters before each merge to `main`. No code changed.

How to view & test:

```bash
docker build -t bookrough-api backend          # ~1.2 GB: docker images bookrough-api
cd frontend && npx vitest run src/vercelConfig.test.ts
```

Smoke test as in Step 3.4, plus one real conversion inside the running container:

```bash
docker exec api-smoke node --input-type=module -e "import { convertLink } from '/app/dist/services/linkScraper.service.js'; console.log(await convertLink('https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv', 'SPOTIFY')); process.exit(0);"
```

→ `converted` with five links. After the merge: production builds, `/api/health` is 200, a real post converts, and Vercel → Usage → Function Storage falls (spec §8, S1–S4). For the follow-up, read Images Storage and Function Storage in Vercel → Usage before and after the first deploying merge once the pause ends (S5).

---

### Step 6.2 — PWA: offline support (Phase 6)

Status: 🟡 In progress — Stages 1–3 done on `feat/pwa-offline`, no PR yet; Stage 4 not started. Waits for Step 6.1a to merge, then updates from `main`.
Branch: feat/pwa-offline
Spec: docs/features/pwa-offline.md

Goal: With no connection, the app opens and previously loaded content is readable. Write actions are clearly blocked rather than failing silently.

> ⚠️ Register the service worker **only in production builds**. A service worker against the Vite dev server serves stale assets and produces hours of phantom debugging. Verify every change with `npm run build && npm run preview`.

Tasks:

- [ ] Frontend: `vite-plugin-pwa` installed and configured, reusing Step 6.1's `manifest.webmanifest` (`manifest: false`). Moved here from Step 6.1.
- [ ] Frontend: Workbox precache of the app shell — HTML, JS, CSS, fonts, icons.
- [ ] Frontend: Runtime cache (stale-while-revalidate) for feed responses and album art. **Never cache auth endpoints or mutations.**
- [ ] Frontend: Designed offline fallback page, not the browser error screen.
- [ ] Frontend: Offline state on post / rate / bookmark controls — explicit "you're offline", nothing queued invisibly.
- [ ] Frontend: Service-worker update prompt when a new version is waiting.
- [ ] Tests: Airplane-mode pass: feed readable, write actions blocked with a clear message.
- [ ] Tests: Deploy a second build and confirm the update prompt appears.

What I did:
How to view & test:

---

### Step 6.3 — Hosting decision + production deploy (Phase 6) — shipped first

Status: ✅ Done
Branch: chore/production-deploy
Spec: docs/features/production-deploy.md

Goal: A public HTTPS URL, with the provider chosen against free-tier terms that are current at this moment — not the ones assumed months earlier.

Tasks:

- [x] Docs: Verify each candidate's **current** free-tier terms and measure Chromium under each CPU cap — Vercel Hobby (Container Runtime + Services) and Neon Free chosen on 2026-10-10, Cloud Run as the fallback (spec §3.1).
- [x] Spec: docs/features/production-deploy.md approved (deploy first; Vercel + Neon; GitHub-integration deploys now, Deployment Checks from 6.4; public but unshared until 6.4).
- [x] Infra: Proof deployment — image builds, health, a real conversion, registry storage, cold start (spec §3.4).
- [x] Infra: `vercel.json` — the `api` (Dockerfile) and `web` (Vite) services on one origin.
- [x] Infra (developer): Neon `main` + `preview` branches; Vercel project, region `fra1`, environment variables; an independent production `JWT_SECRET`; the production origin in the Google OAuth client (spec §3.6).
- [x] Frontend: the API base URL defaults to `/api` in production builds; conversion requests wait 30 s.
- [x] Review: `/code-review` (6 findings, all fixed), `/code-review max` on the PR (5 findings, all addressed) and `/security-review` (clean).
- [x] Tests: unit per spec §7; the production smoke test P1–P7 and P9; P8 partly (see below); P10 (quota after a week) is due 2026-10-18.

What I did:

Put BookRough on a public HTTPS address, `https://bookrough.vercel.app`, per `docs/features/production-deploy.md`. No UC of its own: every UC is now reachable outside localhost.

- **Decision (2026-10-10):** Phase 6 re-sliced to deploy first (the PWA's iPhone checks need HTTPS). The production image was timed locally under each host's CPU cap: every conversion timed out at 0.1 CPU (Render Free, Koyeb Free), about 3 s at 1 vCPU. Chosen: **Vercel Hobby** ($0, no card, 1 vCPU / 2 GB, pauses rather than bills over quota) and **Neon Free** (permanent Postgres 16), both in Frankfurt; **Google Cloud Run** is the agreed fallback. Sources and terms with their date: spec §3.1, `docs/deployment.md` §3.6.
- **Infra:**
  - `vercel.json` (Vercel Services, Beta): `/api/:path*` → the `api` service built from the unchanged `backend/Dockerfile` (Container Runtime, Beta); everything else → the `web` service (Vite build), falling back to `index.html` only for paths without a dot. One origin, so the `SameSite=Lax` cookie and CORS need no change.
  - Neon: branch `main` for production, `preview` for every preview deployment. Vercel: GitHub integration (`main` → production, branches → previews), region `fra1`, variables per environment with separate `JWT_SECRET`s. The developer set every account, secret and console setting; nothing secret is in the repository.
- **Code:**
  - `frontend/src/api/client.ts`: `resolveApiBaseUrl` — `VITE_API_BASE_URL` when set, else `/api` in production builds, `localhost` in development.
  - `frontend/src/api/posts.ts`: creating a post and retrying a conversion wait 30 s (`CONVERSION_REQUEST_TIMEOUT_MS`): a cold start (8.1 s measured) plus the 12 s ceiling could pass the usual 15 s and show an error for a saved post.
  - `backend/src/utils/redactPath.ts`: the request log keeps an **allowlist** of headers (`host`, `user-agent`) and drops the remote address — behind Vercel's proxy the old denylist logged the client's IP, city and coordinates and Vercel's own tokens.
  - `backend/src/config/env.ts`: `LOG_LEVEL` is accepted in any case (`Info` stopped the API once in production).
- **Proof and smoke test (2026-10-10/11):** M1 build ✅, M2 `/api/health` 200 over HTTPS ✅, M3 a real Spotify → Apple Music conversion in **5.3 s** ✅, M4 registry storage 3.12 GB, no charge possible ✅, M5 cold start **8.1 s** (warm ~0.3 s) ✅. P2 sign-in on two browsers, P3 cookie `HttpOnly` + `Secure` + `SameSite=Lax`, P4–P5 community, invite, post and Apple Music link, P6 the four hand-written objects and 14 migrations in Neon (admin role set), P7 deep links, P9 sign-out — all ✅. P8 partly: the branch preview builds and serves (routing checked there), but signing in on a preview needs its address in the OAuth client, which feature 2 decides — so its use of the `preview` database is not yet seen. P10 pending (reminder set for 2026-10-18).
- **Found along the way:** the import page cannot select a branch with `/` (imported from a slash-free copy, since deleted); a Neon project first created in Ohio was recreated in Frankfurt; the function region had stayed `iad1`; the OAuth origin belongs under JavaScript origins, not redirect URIs (`origin_mismatch`); Neon's onboarding sample table `playing_with_neon` was dropped from production.
- **Review:** `/code-review` — SPA fallback serving HTML for missing assets, `/api` itself reaching the SPA, case-sensitive `LOG_LEVEL`, the shared preview database (documented), this entry, and the missing client tests; all fixed. `/code-review max` on PR #33 (the free alternative to `ultra`): the routing test imported `node:fs`, which the frontend has no types for — CI's typecheck and Vercel's build failed while local checks passed on a stray `@types/node` above the repository; now a JSON import. Also a blank `LOG_LEVEL` now means the default, the cookie item in `deployment.md` §7 is ticked, and the routing test says what it does not prove. `/security-review`: clean.
- **Docs:** `deployment`, `tech stack` (Vercel and Neon in §5), `development strategy` (.md + .docx); CLAUDE.md §2, §3, §16; `google-auth.md` (the one-site constraint resolved); `invite-friends.md` Merged ticked; the Phase 6 re-slice above.
- **Tests:** backend 829 (98.85% lines over both suites), frontend 573 (98.75%), E2E 41 + 3 skipped. New: the header allowlist, `LOG_LEVEL` and `CORS_ORIGIN` parsing, the base-URL resolution, the conversion timeouts, and a `vercel.json` routing contract — the routing and serializer tests were each proven to fail against the broken version.

How to view & test:

Production: open `https://bookrough.vercel.app` (desktop or iPhone Safari). Do not share the address yet — it goes to friends after Step 6.4.

1. `https://bookrough.vercel.app/api/health` → `{"status":"success","data":{"status":"ok",…}}`.
2. **Continue with Google** → onboarding → dashboard. DevTools → Application → Cookies → `token`: HttpOnly ✓, Secure ✓, SameSite Lax.
3. Create a community, invite a second Google account (another browser) with the link, post `https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv` → links to the other services within ~10 s; the Apple Music user's link opens Apple Music.
4. Open `/communities/<id>` directly → the page loads; `/assets/missing.js` → Vercel's 404.
5. After ≥ 6 idle minutes, the first load takes ~8 s (cold start); then ~0.3 s.

Operations: Vercel → project `bookrough` (Deployments, Logs — kept 1 hour, Usage); Neon → `bookrough-frankfurt` (SQL Editor, branch `production` / `preview`). Variables and settings: spec §3.6. If a preview breaks after another PR's migration, reset the `preview` branch from its parent in Neon.

Tests:

```bash
cd backend && npm run test:coverage                       # unit + integration, 80% floor
cd backend && npx vitest run src/utils/redactPath.test.ts src/config/env.test.ts
cd frontend && npm run test:unit                          # vercelConfig, api/client, api/posts
npm test --prefix e2e                                     # 41 runs (+3 skipped), needs Docker Postgres
```

---

### Step 6.4 — Production hardening (Phase 6)

Status: 🟡 Built and tested; production checks wait for the Vercel pause to end (2026-11-11)
Branch: chore/production-hardening
Spec: docs/features/production-hardening.md

Goal: The public deployment does not fall over to casual abuse or a bad day at squigly.link.

Tasks (the stale list replaced by the spec, 2026-11-07):

- [x] Spec: docs/features/production-hardening.md approved — sign-up stays open, behind rate limits; counters in memory; `express-rate-limit` (new dependency, approved); four tiers; baseline headers, no CSP; `gitleaks` now and in CI.
- [x] Backend: four rate-limit tiers — conversion (`POST /communities/:id/posts`, `POST /recommendations`, `POST /posts/:id/conversion`), sign-in (`POST /auth/google`, `POST /users/me/google-picture`), outreach (friend requests, invitations, new communities), and a global safety net.
- [x] Backend: `trust proxy` from `TRUST_PROXY_HOPS`; baseline security headers; no `X-Powered-By`.
- [x] Backend: the `p-limit(2)` cap confirmed under a burst, in a unit test and against the real image (M1).
- [x] Backend: log audit (M3) — one finding fixed: Prisma request errors are logged without their message.
- [x] Infra: full-history secret scan (M2) — test fixtures only; a `secrets` CI job from now on.
- [x] Infra: `prune-images` job keeps the registry at the 4 newest images (dry run until `PRUNE_IMAGES=delete`).
- [x] Review: `/code-review` (9 findings: 8 fixed, 1 closed by this PR's docs) and `/security-review` (clean).
- [x] Tests: spec §8 — unit, integration, component; E2E unchanged and green with the limits off.
- [ ] Developer, before merging: `TRUST_PROXY_HOPS=1` in Vercel (Production and Preview); repository secret `VERCEL_TOKEN` and variable `VERCEL_TEAM`; Deployment Checks on `test:e2e` and `test:docker`; Preview retention 7 days; make `checks / secrets` a required check (Claude asks first).
- [ ] After the pause: production checks P2–P7 (spec §8), then `PRUNE_IMAGES=delete` once a dry run's plan has been read.

What I did:

Hardened the public deployment before its address goes to friends (no new UC; it protects UC-1/2, UC-6, UC-9, UC-11 and UC-20), per `docs/features/production-hardening.md`.

- **Rate limits** (`backend/src/middleware/rateLimits.ts`, `express-rate-limit` 8.7.3 pinned): four tiers in each instance's memory. Signed-in tiers count the account, so friends on one Wi-Fi never share a counter; sign-in and the safety net count the address. A refused request is `next(new AppError(…, 429))`, so the central handler writes the standard error shape with `Retry-After`, and the log line carries the tier and `userId`, never the key or the address. `RATE_LIMITS_DISABLED=true` switches them off for E2E and the backend suites; the API refuses it unless `NODE_ENV=test`.
- **Proxy and headers:** `app.set('trust proxy', TRUST_PROXY_HOPS)` (0 by default, 1 behind Vercel); `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a `Permissions-Policy` on every API response (`middleware/securityHeaders.ts`) and every page (`vercel.json`, inside the `web` service, where Vercel's Services routing expects them).
- **Logs:** `utils/safeError.ts` is the `err` serializer for the logger and for pino-http: Prisma request and validation errors — whose messages render the query and its arguments — keep their class, code, model and field names and stack frames only, also when wrapped as another error's cause. The other 59 log calls were read one by one and log ids, counts and outcomes only.
- **Frontend:** the community composer and the recommendation sheet show a `429`'s reason inline ("You're sharing links too fast…") instead of "check your connection", and keep the draft.
- **Secrets:** `gitleaks` 8.30.1 over all 47 commits on every ref found 5 matches, all test fixtures (invite tokens in tests; the E2E Google stand-in key, committed on purpose). Nothing to rotate. `.gitleaksignore` lists them by fingerprint; the `secrets` job in `ci.yml` scans the full history on every run and also fails if it scans nothing.
- **Registry:** `backend/src/ops/pruneImages.ts`, run by `main.yml`'s `prune-images` job after `test:e2e` and `test:docker`, calls Vercel's documented REST API (no CLI): it keeps the 4 newest tagged images, never the current commit's, never an untagged entry, at most 10 deletions a run, and deletes nothing on any surprise in the listing. A dry run until the repository variable `PRUNE_IMAGES` is `delete`.
- **Burst (M1, local image, real squigly.link):** five posts at once converted in 2.4, 2.5, 4.6 and 6.5 s, the fifth saved as `conversion_pending` at 10.9 s; memory 118 MB idle, 327 MB at the peak.
- **CI:** `test:docker` also checks the security headers; the E2E job sets `RATE_LIMITS_DISABLED`.
- **Review:** `/code-review` found 9: gitleaks passing after scanning zero commits, pino-http bypassing the safe serializer, a Prisma error leaking as a `cause`, the prune script's entry check, a strict `RATE_LIMITS_DISABLED` parse, `/api/health/` counted, connection errors losing their message, and `requireAuth` before the sign-in limit — all fixed — plus the §18 docs, written here. `/security-review`: nothing at confidence 8 or above.
- **Docs:** `tech stack`, `deployment`, `tests`, `git workflow`, `system architecture conventions` (.md + .docx); CLAUDE.md §2, §10, §16; decision rows in `production-deploy.md` and `deployment-storage.md`; `HANDOFF.md`.
- **Tests:** backend 72 files, 1,245 tests at 98.98% lines over both suites; frontend 61 files, 747 tests at 98.67%; E2E 43 passed (+3 skipped) with the limits off. New: `rateLimits.integration.test.ts` (15 — every tier, the shared counters, per-user and per-address keys, a spoofed `X-Forwarded-For`, `/api/health`, headers on 200/404/429/500), `rateLimits.test.ts`, `safeError.test.ts`, `pruneImages.test.ts` (23), the environment rules, a five-request burst, and 429 cases for both composers and Welcome.

How to view & test:

Locally, with Docker Desktop running and `docker compose up -d`, start the API (`cd backend && npm run dev`), then send eleven junk sign-ins:

```bash
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Content-Type: application/json' -d '{"credential":"junk"}' http://localhost:4000/api/auth/google; done
```

Ten `401`s, then `429`. `curl -I http://localhost:4000/api/health` shows `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`, and no `X-Powered-By`. In the app (`cd frontend && npm run dev`, `http://localhost:5173/`), posting 11 links within 10 minutes shows "You're sharing links too fast…" under the composer, with the link still in the field.

Tests:

```bash
cd backend && npm run test:coverage
cd backend && npx vitest run -c vitest.integration.config.ts src/routes/rateLimits.integration.test.ts
cd backend && npx vitest run src/utils/safeError.test.ts src/ops/pruneImages.test.ts src/services/linkScraper.service.test.ts
cd frontend && npm run test:unit
npm test --prefix e2e
```

After the pause (developer, with Claude): spec §8 P2–P7 — 11 junk sign-ins from a laptop give `429` while the iPhone on cellular still signs in; a merge waits for Deployment Checks; `curl -I https://bookrough.vercel.app/` shows the headers; read the `prune-images` dry run in the Actions log, then set `PRUNE_IMAGES=delete`; post a real Spotify link. **Then the address can go to friends.**

---

### Step 6.5 — README polish + deployment notes (Phase 6)

Status: ☐ Not started
Branch: docs/readme-deploy

Goal: README explains what BookRough is, how to develop locally, how to test, and how it is deployed.

Tasks:

- [ ] Docs: Rewrite README sections: Overview, Local dev, Tests, PWA, Deployment, Contributing (links back to CLAUDE.md).
- [ ] Docs: Confirm `docs/deployment.md` and its `.docx` companion reflect what was actually deployed, per the dual-file rule in CLAUDE.md §14.1.

What I did:
How to view & test:
