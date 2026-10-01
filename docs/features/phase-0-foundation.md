# Feature: Phase 0 — Local environment & shared infrastructure

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Use cases** | None — Phase 0 predates the UC-numbered features. It is the ground they are built on.     |
| **Phase**     | 0 (Steps 0.1 – 0.5)                                                                       |
| **Branch**    | `chore/phase-0-skeleton` (Steps 0.1–0.3), then `chore/phase-0-tooling-ci` (Steps 0.4–0.5) |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                        |

---

## 0. Why one spec for five steps

`DEVELOPMENT.md` lists Phase 0 as five steps and gives none of them a `Spec:` line, unlike every step from 1.1 onward. That is not an oversight to correct by writing five documents: Phase 0 contains no product decisions, no use case, and nothing a user sees. What it does contain is a set of infrastructure choices that must agree with one another — the port the API listens on, the database the tests use, the Node version CI runs. Those are worth writing down once, together, so they cannot drift apart.

The four-stage session (§15) still applies. This document is Stage 1 for all of Phase 0; Stages 2–4 then run per pull request.

### The starting point

**The repository currently contains no application code.** Commit `506da2a` implemented Phase 0 and Phase 1, and commit `90becc2` deleted all of it when the specifications were settled — that implementation carried email/password authentication and a `password_resets` table, both since rejected (CLAUDE.md §5). What remains under version control is `CLAUDE.md`, `DEVELOPMENT.md`, `README.md` and `docs/`.

Consequence: Phase 0 is built from an empty directory, and the `[x]` marks presently sitting on tasks in Steps 0.1–0.3 of `DEVELOPMENT.md` are stale residue from the deleted work. They are reset to `[ ]` as part of this feature.

---

## 1. Goal

After Phase 0, a developer can clone the repository, run four commands, and have a Postgres database, an API answering `GET /api/health`, and a React shell rendering in the browser. Every commit is linted, formatted, and checked for a Conventional Commit message before it is created, and every pull request is blocked from merging until lint, typecheck, unit tests and integration tests pass on GitHub.

Nothing in this phase is visible to an end user. Its deliverable is that the next five phases have somewhere to land.

## 2. Scope

**In scope**

- **Step 0.1** — `docker-compose.yml` with Postgres 16; `.env.example` for both packages; README "Local setup" section.
- **Step 0.2** — Express bootstrap: `AppError`, the central error handler, the response wrappers, the health route, Pino logging.
- **Step 0.3** — Vite + React + TypeScript + Tailwind shell: axios client with its interceptor, toasts, Error Boundary, two placeholder routes.
- **Step 0.4** — ESLint, Prettier, Husky, lint-staged, commitlint, all wired from the repository root.
- **Step 0.5** — `pr.yml` and `main.yml`, the 80% coverage floor with documented exclusions, branch protection on `main`, and a throwaway pull request proving the gate blocks a red check.

**Out of scope** — explicitly, so the phase ends rather than sprawling

- **Any Prisma schema or migration.** `prisma` and `@prisma/client` are installed and `DATABASE_URL` is configured, but `schema.prisma` gets no models and no migration is generated. The `users` table is Step 1.1, and it has its own spec.
- **Any authentication.** No JWT helpers, no auth middleware, no `google-auth-library`, no cookie issuing. `JWT_SECRET` appears in `.env.example` as a blank placeholder only. All of it is Step 1.3.
- **The Welcome and Complete-Your-Profile screens.** Step 0.3 creates the two routes as placeholder components rendering a heading and nothing else. The real screens are Steps 1.5 and 1.6.
- **The Zustand auth store.** The axios 401 interceptor is specified now but calls a single narrow function (`onUnauthorized`) that Step 1.5 wires to the store. Phase 0's implementation of that function redirects to `/` and does nothing else.
- **Playwright, the scraper, and the backend `Dockerfile`.** The scraper is Phase 3; the production Docker image is Phase 6. `docker-compose.yml` here runs _only_ Postgres, for local development. It is not a deployment artifact.
- **PWA anything** — no `vite-plugin-pwa`, no manifest, no service worker, no icons. Phase 6, Steps 6.1 and 6.2. Registering a service worker this early would poison every subsequent debugging session (CLAUDE.md §16).
- **Actual E2E tests.** The `e2e/` package is created with its Playwright config and zero specs, so `main.yml` has a real target. The first spec is written at Step 1.7.
- **The hosting provider.** Deliberately undecided until Phase 6 (CLAUDE.md §16).

## 3. Data model changes

**None.** `prisma/schema.prisma` is created containing only the `generator` and `datasource` blocks pointed at `env("DATABASE_URL")`. No model, no enum, no migration, no `prisma migrate` invocation in this phase.

This matters for Step 0.5: the `test:integration` job starts a `postgres:16` service container and runs a migration step that is a no-op today. The job is wired for a schema that does not exist yet, deliberately, so that Step 1.1 has nothing left to configure.

## 4. API

### `GET /api/health`

- **Auth:** public
- **Request:** no body, no params
- **Success:** `200` — `{ "status": "success", "data": { "status": "ok", "uptime": <seconds>, "timestamp": "<ISO 8601>" } }`
- **Errors:** none. If this route can fail, the process is already down.

The database is deliberately **not** checked here. A health endpoint that queries Postgres conflates "the API is up" with "its dependency is up", and at Phase 6 a deploy platform will read this route to decide whether to keep the container alive. A separate readiness check can be added later if a provider needs one.

### `GET /api/__boom` — test-only

- **Auth:** public, and **registered only when `NODE_ENV === 'test'`**
- **Behaviour:** throws `new AppError('Intentional test failure', 418)` synchronously
- **Success:** never
- **Errors:** `418` — `{ "status": "error", "code": 418, "message": "Intentional test failure" }`

This exists to prove the error middleware's output shape in an integration test without waiting for a real feature to produce a failure. It is not mounted in development or production.

### Any unmatched path

- **Errors:** `404` — `{ "status": "error", "code": 404, "message": "Route not found." }`, produced by a `notFound` middleware registered after all routes and before the error handler.

### Error handler contract

- Registered last, four-arity `(err, req, res, next)`.
- An `AppError` yields its own `statusCode` and `message`.
- Anything else yields `500` with the fixed message `"Something went wrong."` — the original error is logged with its stack via Pino, never sent to the client (CLAUDE.md §4).
- The stack trace is never included in a response body in any environment.

## 5. Screens & components

No screen from `docs/frontend screens.md` is implemented in this phase. What is created:

| Route         | Component                   | Content                                                                                                           |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`           | `pages/Welcome.tsx`         | Placeholder: the app name and one line of body text. Step 1.5 replaces the body.                                  |
| `/onboarding` | `pages/CompleteProfile.tsx` | Placeholder heading only. Step 1.6 replaces it.                                                                   |
| `*`           | `pages/NotFound.tsx`        | "This page doesn't exist." plus a link home. Doubles as the 403 surface for the admin area later (CLAUDE.md §17). |

There is **no `/login` and no `/signup` route**, now or ever — sign-in is a single button on Welcome (CLAUDE.md §5).

**Shared states delivered in this phase, so no later screen has to invent them:**

- **Loading** — `components/Spinner.tsx`, a single accessible spinner with an optional label, used by every later screen's loading state (CLAUDE.md §8: loading is a designed state).
- **Error** — `components/ErrorBoundary.tsx` wrapping the routed tree, rendering a fallback with a "Reload" button instead of a white screen.
- **Toast** — `react-hot-toast`'s `<Toaster />` mounted once in `main.tsx`, positioned top-centre so it clears an iPhone notch and does not sit under a thumb.

**Layout rules applied from the first line:** base Tailwind classes target 375px, `sm:`/`md:`/`lg:` expand upward, and every interactive element is at least 44×44px. Verified at 375px before any wider viewport.

## 6. Edge cases & failure modes

| Situation                                       | Behaviour                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres is not running when the backend starts | The backend starts anyway and `/api/health` returns 200. Nothing connects to the database in Phase 0.                                                                                                  |
| A required environment variable is missing      | `src/config/env.ts` validates `process.env` with Zod at import time and **exits with a non-zero code and a readable message naming the variable**. Failing at boot beats failing at the first request. |
| `.env` does not exist at all                    | Same path: the Zod parse fails, the message names the missing keys and points at `.env.example`.                                                                                                       |
| Port 4000 or 5173 already in use                | Left to the underlying tool's error. Not worth wrapping.                                                                                                                                               |
| The API is unreachable from the frontend        | The axios interceptor catches the network error and toasts "Can't reach the server." — a request with no `error.response` is not a 4xx/5xx and must not crash the interceptor.                         |
| A `401` arrives                                 | Interceptor calls `onUnauthorized()` and redirects to `/`. In Phase 0 that function only redirects; Step 1.5 adds the store clear.                                                                     |
| A React component throws during render          | The Error Boundary renders its fallback. The error is logged to the console in development only.                                                                                                       |
| A commit message violates Conventional Commits  | The `commit-msg` hook rejects it. The fix is a corrected message — never `--no-verify` (CLAUDE.md §11).                                                                                                |
| Lint fails on a staged file                     | The `pre-commit` hook fails and the commit does not happen.                                                                                                                                            |
| CI is red on a pull request                     | Branch protection refuses the merge. Claude does not merge a red check even if told to (CLAUDE.md §11).                                                                                                |
| Docker Desktop is not running                   | `docker compose up -d` fails with a daemon error. Noted in the README prerequisites — the developer starts Docker Desktop first.                                                                       |

## 7. Test scenarios

Phase 0 has no services and no endpoints beyond health, so the pyramid is deliberately bottom-light. Every item below is a real assertion; none exists to lift the coverage number (CLAUDE.md §10).

**Unit (backend)**

- ✅ `AppError` sets `message`, `statusCode`, and `isOperational = true`, and captures a stack.
- ✅ `success(data)` returns `{ status: 'success', data }`.
- ✅ `failure(code, message)` returns `{ status: 'error', code, message }`.
- ✅ `env.ts` parses a complete, valid environment without throwing.
- ❌ `env.ts` throws when `DATABASE_URL` is absent, and the thrown message names the variable.

**Integration (backend, Supertest)**

- ✅ `GET /api/health` → `200`, body matches the success envelope and `data.status === 'ok'`.
- ❌ `GET /api/__boom` → `418` with the error envelope, `code: 418`, and the AppError's message.
- ❌ `GET /api/__boom` response body contains **no** `stack` property.
- ❌ `GET /api/does-not-exist` → `404` with the error envelope and the "Route not found." message.

**Component (frontend, RTL)**

- ✅ `ErrorBoundary` renders its children when nothing throws.
- ❌ `ErrorBoundary` renders the fallback, including the Reload button, when a child throws.
- ✅ The router renders the Welcome placeholder at `/`.
- ✅ The router renders the NotFound page at an unknown path.
- ✅ `Spinner` renders with an accessible name so a loading state is announced.

**Unit (frontend)**

- ✅ The axios interceptor passes a successful response through untouched.
- ❌ On a `401`, the interceptor calls `onUnauthorized` exactly once.
- ❌ On a `500`, the interceptor shows a toast carrying the backend's `message` field.
- ❌ On a network error with no `error.response`, the interceptor toasts the offline message and does not throw.

**E2E**

None. The `e2e/` package is created with its config and zero specs; the `test:e2e` job runs it and passes on an empty suite. The first spec is Step 1.7.

**CI gate verification (Step 0.5, manual, once)**

- ❌ A throwaway branch with one deliberately failing test opens a pull request, `pr.yml` goes red, and GitHub blocks the merge button. The branch is then closed and deleted, and the result is recorded in `DEVELOPMENT.md`.

## 8. Open questions

Empty. The nine questions raised at the start of this session were answered by the developer and are recorded in §9 below.

## 9. Decisions log

| Date       | Decision                                                                                         | Reason                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-24 | One combined spec for all five Phase 0 steps                                                     | No product decisions in the phase; the infrastructure choices need to agree with each other, which is easier to check in one document than across five.                                                                                          |
| 2026-09-24 | Two pull requests: `chore/phase-0-skeleton` (0.1–0.3), then `chore/phase-0-tooling-ci` (0.4–0.5) | Five PRs means five stop points for a phase with nothing visible in it. Splitting after 0.3 matters because 0.4 and 0.5 change the rules for every commit that follows them — the skeleton should be in place before the hooks start judging it. |
| 2026-09-24 | PRs for the skeleton merge without a CI gate                                                     | `pr.yml` does not exist until 0.5. Unavoidable and accepted by the developer; §11's gate rule is conditional on the workflow existing.                                                                                                           |
| 2026-09-24 | Test database is `music_app_test_db`                                                             | Matches CLAUDE.md §10 and `docs/tests.md` §3.3. The current README's `music_app_test` is the odd one out and gets corrected. Dev database is `music_app_dev`.                                                                                    |
| 2026-09-24 | Node 24 LTS, not 22                                                                              | The developer's machine runs v24.11.0. CI should match the machine that writes the code; pinned via `.nvmrc` and `engines`.                                                                                                                      |
| 2026-09-24 | No npm workspaces                                                                                | A root `package.json` carries the quality tooling only; `backend/` and `frontend/` install independently, as the README already describes. Avoids hoisting surprises with Prisma's generated client and Playwright's browser binaries.           |
| 2026-09-24 | `e2e/` lives at the repository root as its own package                                           | Matches the deleted implementation's layout and keeps Playwright's browser download out of the two shipping packages. CLAUDE.md §3's tree gets an `e2e/` entry.                                                                                  |
| 2026-09-24 | Branch protection configured by Claude via `gh api`                                              | `gh` is authenticated as the repository owner with `repo` and `workflow` scopes, and the repository is public, so protection rules are available. If the API refuses, the developer sets it in the GitHub UI instead.                            |
| 2026-09-24 | Health check does not touch the database                                                         | Conflating "API is up" with "its dependency is up" makes a deploy platform restart a healthy container over a transient database blip.                                                                                                           |
