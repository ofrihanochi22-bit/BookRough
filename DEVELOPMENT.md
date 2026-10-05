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

- **Image:** `backend/Dockerfile` is a multi-stage build on `mcr.microsoft.com/playwright:v1.63.0-noble` (Ubuntu 24.04, Node 24, Chromium pinned to our Playwright 1.63.0). The runtime stage holds production dependencies, `dist/` and the Prisma migrations only. It runs as the non-root `pwuser`, with `tini` as PID 1, and its start command is `prisma migrate deploy && exec node dist/index.js`. A `HEALTHCHECK` calls `/api/health`. `backend/.dockerignore` keeps `.env` and build output out of the context.
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
3. In another terminal, run `docker exec api-smoke whoami` → `pwuser`.
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

### Step 4.1 — Ratings + bookmarks schema (Phase 4)

Status: ☐ Not started
Branch: feat/db-ratings-bookmarks-schema

Goal: Migration adds `ratings` (unique on `(post_id, user_id)`) and `bookmarks` (composite PK) tables.

Tasks:

- [ ] DB: Add `Rating` and `Bookmark` models per `tables.docx`.
- [ ] DB: Migration `add_ratings_bookmarks`.

What I did:
How to view & test:

---

### Step 4.2 — Bookmark + rating routes (Phase 4 — UC-12, UC-13)

Status: ☐ Not started
Branch: feat/ratings-bookmarks-api

Goal: Users can bookmark/unbookmark posts and submit a 1–10 rating with optional comment.

Tasks:

- [ ] Backend: `POST /api/posts/:id/bookmark` + `DELETE /api/posts/:id/bookmark`.
- [ ] Backend: `POST /api/posts/:id/ratings` (unique-per-user enforced; on submit, remove from bookmarks if present).
- [ ] Backend: `GET /api/posts/:id/ratings` returns reviews + average for UC-16.
- [ ] Backend: `GET /api/users/me/bookmarks` for the My List screen.
- [ ] Tests: Integration tests for unique-rating constraint and bookmark removal on rate.

What I did:
How to view & test:

---

### Step 4.3 — Notification stub on rating (Phase 4 — UC-13)

Status: ☐ Not started
Branch: feat/rating-notification-stub

Goal: When a rating is submitted, a stub notification is emitted to the post author (logged via Pino now, real channel later).

Tasks:

- [ ] Backend: Service-layer hook after rating insert that logs `INFO` with `{ authorId, raterId, score }`.
- [ ] Backend: Note in the code where the real notification channel will plug in (no implementation).

What I did:
How to view & test:

---

### Step 4.4 — Engagement UI (Phase 4 — UC-12, UC-13, UC-16)

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

### Step 4.5 — Phase 4 test coverage (Phase 4)

Status: ☐ Not started
Branch: test/engagement

Goal: Routes have integration tests, star control has RTL coverage.

Tasks:

- [ ] Tests: RTL on the star control: clicking 7 reports score 7.
- [ ] Tests: Integration: full rate-then-fetch-feedback loop returns the new average.

What I did:
How to view & test:

---

## Phase 5 — Social Discovery (UC-5, UC-6, UC-7, UC-8)

### Step 5.1 — Friends schema (Phase 5)

Status: ☐ Not started
Branch: feat/db-friends-schema

Goal: Migration adds the `friends` table with the `(requester_id, addressee_id)` composite PK and `status` enum.

Tasks:

- [ ] DB: Add `Friend` model + migration.
- [ ] DB: Application-level guard that prevents reverse-direction duplicates per `tables.docx`.

What I did:
How to view & test:

---

### Step 5.2 — Search + friend routes (Phase 5 — UC-5, UC-6, UC-7, UC-8)

Status: ☐ Not started
Branch: feat/friends-api

Goal: APIs cover global user search, sending requests, accept/ignore, and unfriending.

Tasks:

- [ ] Backend: `GET /api/users?q=` partial match on `username` + `display_name`.
- [ ] Backend: `POST /api/friends/requests` (creates PENDING).
- [ ] Backend: `POST /api/friends/requests/:id/accept` and `.../ignore`.
- [ ] Backend: `DELETE /api/friends/:userId` (unfriend).
- [ ] Tests: Integration: lifecycle from request → accept → unfriend; ghost-request handling per UC-7 fail path.

What I did:
How to view & test:

---

### Step 5.3 — Discovery UI (Phase 5 — UC-5, UC-6, UC-7, UC-8)

Status: ☐ Not started
Branch: feat/friends-ui

Goal: Global search bar, public profile screen, and Friends & Requests tab work end-to-end.

Tasks:

- [ ] Frontend: `pages/Search.tsx` global search results.
- [ ] Frontend: `pages/PublicProfile.tsx` with dynamic Add Friend / Pending / Friends / blocked-or-hidden states per UC-6.
- [ ] Frontend: `pages/Friends.tsx` with My Friends + Pending Requests tabs.
- [ ] Tests: RTL on the dynamic friend button rendering for each state.

What I did:
How to view & test:

---

### Step 5.4 — Phase 5 test coverage (Phase 5)

Status: ☐ Not started
Branch: test/friends

Goal: Friend lifecycle covered by integration + a single happy-path E2E.

Tasks:

- [ ] Tests: E2E: two users, one sends a request, the other accepts.

What I did:
How to view & test:

---

## Phase 6 — Shipping It

> Feature-complete is not shipped. This phase turns a working local application into something a friend group can actually use, on a phone.
>
> CI moved to Phase 0 (Step 0.5) — a merge gate that arrives at the end has already failed at its job.

### Step 6.1 — PWA: installable (Phase 6)

Status: ☐ Not started
Branch: feat/pwa-installable
Spec: docs/features/pwa-installable.md

Goal: The site installs to an iPhone home screen from Safari and launches full-screen with no browser chrome.

Tasks:

- [ ] Frontend: `vite-plugin-pwa` installed and configured.
- [ ] Frontend: `manifest.webmanifest` — name, short_name, start_url, `display: standalone`, theme and background colours.
- [ ] Frontend: Full icon set — 192px, 512px, 512px maskable, plus the iOS `apple-touch-icon` sizes.
- [ ] Frontend: iOS-specific meta tags (Safari does not read everything from the manifest).
- [ ] Tests: Manual — install on a real iPhone from Safari and launch from the home screen. A Lighthouse score is not sufficient evidence.

What I did:
How to view & test:

---

### Step 6.2 — PWA: offline support (Phase 6)

Status: ☐ Not started
Branch: feat/pwa-offline
Spec: docs/features/pwa-offline.md

Goal: With no connection, the app opens and previously loaded content is readable. Write actions are clearly blocked rather than failing silently.

> ⚠️ Register the service worker **only in production builds**. A service worker against the Vite dev server serves stale assets and produces hours of phantom debugging. Verify every change with `npm run build && npm run preview`.

Tasks:

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

### Step 6.3 — Hosting decision + production deploy (Phase 6)

Status: ☐ Not started
Branch: chore/production-deploy

Goal: A public HTTPS URL, with the provider chosen against free-tier terms that are current at this moment — not the ones assumed months earlier.

Tasks:

- [ ] Docs: Verify each candidate's **current** free-tier terms (memory ceiling, idle spin-down, free-database lifetime) and record the decision and its date in `docs/deployment.md` §3.
- [ ] Infra: Provision production Postgres; set `DATABASE_URL`; run Prisma migrations against it.
- [ ] Infra: Generate an independent production `JWT_SECRET`. It must not match any development value.
- [ ] Infra: Add the production origin to the Google OAuth client's authorised origins and redirect URIs.
- [ ] Infra: Deploy the backend from the Playwright-based Docker image; `/api/health` returns 200 over HTTPS.
- [ ] Infra: Build and deploy the frontend with the production `VITE_API_BASE_URL`.
- [ ] Infra: CORS locked to the exact production frontend origin — not a wildcard.
- [ ] Tests: Verify the auth cookie is `HttpOnly`, `Secure`, and correctly `SameSite` for the final origin layout.
- [ ] Tests: **Verify link conversion end-to-end in production.** This is the step most likely to fail — Chromium's memory footprint on a small instance is not reproducible locally. If it fails, lower the `p-limit` cap to 1 before anything more elaborate.

What I did:
How to view & test:

---

### Step 6.4 — Production hardening (Phase 6)

Status: ☐ Not started
Branch: chore/production-hardening

Goal: The public deployment does not fall over to casual abuse or a bad day at squigly.link.

Tasks:

- [ ] Backend: Rate limiting on auth endpoints (login, register, password reset) and on post creation.
- [ ] Backend: Confirm the `p-limit(2)` scraper cap holds under a burst, and that queued requests still respect the 12-second ceiling.
- [ ] Backend: Audit logs for leaked secrets or PII before they go anywhere persistent.
- [ ] Infra: Confirm no secret is committed anywhere in the repository history.
- [ ] Infra: Nightly E2E workflow is running and its failures are visible.

What I did:
How to view & test:

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
