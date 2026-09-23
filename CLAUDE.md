# CLAUDE.md — BookRough Working Agreement

This file is the working contract between the developer and Claude. Read it before touching any code in this repository. The full feature roadmap lives in [DEVELOPMENT.md](DEVELOPMENT.md).

---

## 1. Project overview

**BookRough** is a social platform that lets friend groups share, rate, and discuss music recommendations across different streaming services. The "magic" feature is automatic universal-link conversion: a user pastes a Spotify link, and a friend on Apple Music sees an Apple Music link in the same post. Conversion is performed server-side via a Playwright headless browser scraping `squigly.link`.

**Audience and delivery target.** This is a portfolio / learning project that is also intended for genuine use by a small group of friends. It therefore has to end up as a real, deployed website that works in two forms:

1. A desktop browser experience.
2. An **installable PWA** — added to the iPhone home screen from Safari and launched full-screen, with no browser chrome.

"It works on my machine" is not the finish line. Every decision should keep a real deployment reachable.

---

## 2. Tech stack

**Frontend** (`frontend/`)
- React + Vite + TypeScript
- Tailwind CSS for styling
- Zustand for global state (auth session, preferred streaming service)
- `@react-oauth/google` for the Google login popup
- React Router for routing
- Axios for HTTP
- `vite-plugin-pwa` (Workbox under the hood) for the installable, offline-capable PWA — see §16

**Backend** (`backend/`)
- Node.js + Express + TypeScript
- Prisma ORM on PostgreSQL
- `jsonwebtoken` for app session tokens (HttpOnly cookie)
- `google-auth-library` for verifying Google identity tokens server-side — the only auth mechanism; `bcrypt` has been removed from the stack because no passwords exist (§5)
- `playwright` (headless Chromium) for the link-conversion scraper
- `p-limit` to cap concurrent Chromium instances — see §7
- Pino for structured logging
- Zod for request validation

**Database**
- PostgreSQL (single instance, separate `music_app_test_db` for integration tests)

**Tests**
- Vitest as test runner
- React Testing Library for components
- Supertest for backend integration tests
- Playwright for E2E

**Code quality (repo root)**
- ESLint + Prettier, shared config across both packages
- Husky + `lint-staged` — pre-commit hook runs lint and format on staged files only
- `commitlint` with `@commitlint/config-conventional` — a commit-msg hook rejects any message that is not a valid Conventional Commit, so §11 is enforced mechanically rather than by discipline

**Infra**
- Docker (backend image is based on `mcr.microsoft.com/playwright` so Chromium dependencies are available)
- GitHub Actions for CI — see §10 for exactly what gates a merge

**Explicitly rejected alternatives** (do not reintroduce without a new decision):
- **Odesli / Songlink API** for link conversion. The service has been degraded for months and does not return links for most platforms. `squigly.link` + Playwright is the chosen path. (`docs/general.md` originally suggested Odesli; that has been corrected.)
- **MongoDB.** The data is relational. PostgreSQL + Prisma, full stop.
- **i18n / RTL.** The UI is English-only — see §8.
- **User image uploads.** Generated avatars only — see §8.
- **Email/password login, and any second identity provider.** Google Sign-In only — see §5. `bcrypt` and `password_resets` are gone.
- **Storing user email addresses.** Deliberate data minimisation — see §5. Do not add an email column back without a new recorded decision.

---

## 3. Repository layout

```
/
├── backend/
│   ├── prisma/             ← schema.prisma, migrations
│   ├── src/
│   │   ├── routes/         ← thin HTTP route definitions
│   │   ├── controllers/    ← Zod validation + service calls
│   │   ├── services/       ← business logic, no req/res
│   │   ├── middleware/     ← auth, error handler
│   │   ├── utils/          ← AppError, response wrappers, logger
│   │   └── index.ts        ← Express bootstrap
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── pages/          ← screen-level components (one per UC screen)
│   │   ├── components/     ← reusable UI
│   │   ├── stores/         ← Zustand stores
│   │   ├── api/            ← axios client + per-resource API modules
│   │   └── App.tsx
│   ├── public/             ← PWA manifest + icon set (see §16)
│   ├── index.html
│   └── vite.config.ts
├── docs/
│   ├── <spec>.docx         ← foundational specs: .docx + parallel .md (see §14.1)
│   ├── <spec>.md
│   └── features/           ← per-feature specs, Markdown only (see §14.2, §15)
│       ├── _TEMPLATE.md
│       └── <feature>.md
├── .github/workflows/      ← pr.yml (gates merge) + main.yml (adds E2E) — see §10
├── .husky/                 ← pre-commit (lint-staged) + commit-msg (commitlint)
├── CLAUDE.md               ← you are here
├── DEVELOPMENT.md          ← step-by-step roadmap (UPDATE THIS)
└── README.md
```

---

## 4. Architecture conventions

### Backend layering (strict)

```
Router → Controller → Service → Prisma
```

- **Router**: route definition only. No logic.
- **Controller**: parses + validates `req.body` / `req.params` with Zod, calls a service, formats the response. Handles `req` / `res`.
- **Service**: business logic. **Never sees `req` or `res`.** Takes raw arguments, returns raw data, throws `AppError` on failure.
- **Prisma client** is the only thing that touches the DB. Never write raw SQL unless the query genuinely cannot be expressed in Prisma.

### Errors

- One `AppError` class extending `Error` with `(message: string, statusCode: number)`.
- One central Express error-handling middleware registered last. Every controller calls `next(err)` instead of writing error responses inline.
- Convert Prisma errors (e.g. unique constraint `P2002`) into friendly `AppError`s. **Never leak raw DB errors to the client.**

### API response shape

Every JSON response uses one of these two shapes:

```json
// success
{ "status": "success", "data": { ... } }

// error
{ "status": "error", "code": 404, "message": "Community not found." }
```

### Frontend conventions

- One axios instance with an interceptor that:
  - On `401`: clears the auth store and redirects to `/` (the Welcome screen). There is no `/login` route — sign-in lives on Welcome (§5, §8).
  - On any `4xx`/`5xx`: shows a toast with the backend's `message`.
- Wrap the routed app in a React Error Boundary so a component crash shows a localized fallback instead of a white screen.

### Logging

- Pino, with levels `ERROR` / `WARN` / `INFO` / `DEBUG`.
- Every log line includes `timestamp`, `level`, `context` (module name), `message`.
- Include `userId` in metadata when relevant. **Never log passwords, tokens, or raw PII.**
- `console.log` is banned in committed code.

---

## 5. Authentication conventions

Full detail in [docs/auth.md](docs/auth.md) (companion `docs/auth.docx`).

- **Google Sign-In is the only authentication method.** No email/password login, no password hashing, no password recovery. Sign-up and login are the same button.
- The account key is the Google **`sub` claim**, stored as `users.google_sub` (unique). Not the email.
- Flow:
  1. Frontend uses `@react-oauth/google` `<GoogleLogin>` to obtain a Google identity token.
  2. Frontend `POST`s the token to `/api/auth/google`.
  3. Backend verifies the token with `google-auth-library` (audience = `GOOGLE_CLIENT_ID`).
  4. Backend reads `sub` and `picture`, looks up the user by `google_sub`, and creates a row if none exists.
  5. Backend issues the app JWT as an `HttpOnly`, `Secure` cookie named `token`, plus `needsOnboarding`.
  6. Users needing onboarding are routed to **Complete Your Profile** to set `username` and `preferred_service` before the dashboard is reachable.
- **Account collision cannot occur.** One provider, one unique key, no merge logic.

### 🔴 The email address is never stored

The Google identity token carries an `email` claim. **Read it for verification, then discard it.** It is never written to the database, never logged, and never returned by any endpoint — including the admin area (§17).

This is a deliberate data-minimisation decision by the product owner. Accepted consequences:

- The application can **never send email** to a user.
- A user who loses their Google account **cannot be recovered**, and support cannot identify them.
- There is no address to leak, so a database breach exposes no personal contact data.

**Honest limit:** this reduces *incidental* exposure and removes a class of breach. It is **not** a cryptographic guarantee against the operator, who runs the server and can change the code. The protection is that the data does not exist.

**Enforcement rule:** never return a raw Prisma user object. Every endpoint serialises through an explicit `toPublicUser` mapper, field by field, so a column added later cannot leak by accident.

---

## 6. Database

The schema is defined in `backend/prisma/schema.prisma`. The full table-by-table contract is in [docs/tables.md](docs/tables.md) (companion `docs/tables.docx`). **Seven tables** in total:

`users`, `communities`, `community_members`, `friends`, `posts`, `ratings`, `bookmarks`.

- `password_resets` **was removed** — no passwords, no email, nothing to reset (§5, withdrawn UC-17).
- `users` has **no `email` and no `password_hash`**. The account key is `google_sub`; `role` (`USER` / `ADMIN`) gates the admin area and is set directly in the database, never through an API.
- The admin area will need a settings table. It is **not designed yet** — that happens in its own feature session (§15) and lands in `docs/features/admin-panel.md` before any migration is written.

Always create migrations via `npx prisma migrate dev --name <descriptive-name>`. Never edit a migration after it has been applied; create a new one.

---

## 7. Link converter (Playwright)

- Lives in `backend/src/services/linkScraper.service.ts`.
- Headless Chromium with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`.
- Block `image`, `stylesheet`, `font`, `media` requests to save memory and time.
- `page.waitForSelector` timeout = **8 seconds**, not the default 30.
- Browser is closed in a `finally` block — always.
- **Fail gracefully**: if scraping throws, save the post with `original_url` only and a `conversion_pending` flag. Don't drop the user's content.
- **Concurrency cap**: wrap the scrape in `p-limit(2)`. Each Chromium instance costs real memory, and the deployment target is a small/free tier. Two simultaneous posts is the ceiling; the third waits.
- Production runs inside the `mcr.microsoft.com/playwright` Docker base image (Chromium system deps preinstalled).

### Latency budget and posting UX

Scraping a live site in a headless browser takes **3–8 seconds**. That is inherent to the approach and cannot be optimised away.

- The original PRD non-functional requirement of "conversion under 2 seconds" was **written for the Odesli API and is void**. The replacement budget is: **p95 under 10 seconds end-to-end, hard ceiling 12 seconds** before the request is abandoned and the post is saved as `conversion_pending`.
- **The posting flow is synchronous and blocking.** The user presses Submit, sees a spinner with progress copy, and the post is born complete. We are not doing optimistic insert + background job + polling; the extra machinery is not worth it at this scale.
- Because the wait is long and visible, the spinner is a designed state, not a default one: show what is happening ("Finding this track on other services…"), and never leave the button in an ambiguous state.
- If the ceiling is hit, the post still saves. The user sees the post with their original link and a quiet "other services unavailable" note — not an error dialog, and never a lost draft.

---

## 8. Frontend screens

The full screen catalog is in [docs/frontend screens.md](<docs/frontend screens.md>) (companion `docs/frontend screens.docx`). **Thirteen screens**, four groups:

- **Auth & Onboarding**: Welcome (one "Continue with Google" button — registration and login in the same action), Complete Your Profile.
- **Main Navigation & Social**: Communities Dashboard (home), Global Search, Friends & Requests, Public User Profile.
- **Community & Music**: Community Feed, Create Community, Community Settings & Members, Post Detail / Feedback.
- **Personal**: My List (Listen Later), Submit Rating modal, My Profile / Settings.

Registration, Login, Forgot Password, and Create New Password screens were **withdrawn** when email/password auth was dropped (§5). Admin screens (§17) are not in the catalog yet — they are specified in that feature's own session.

### UI conventions

- **Language: English only.** All UI copy, labels, errors, and empty states are in English. There is **no i18n layer and no RTL support** — do not add `react-i18next`, do not add `dir` switching, do not write translation keys. A hardcoded English string is the correct implementation.
- **Mobile-first.** Write the base Tailwind classes for a phone viewport and add `sm:` / `md:` / `lg:` upward. The primary target device is an iPhone running the installed PWA; the desktop browser is the secondary layout. Verify at 375px width before anything else.
- **Touch targets** are at least 44×44px, because the primary surface is a phone.
- **No image uploads.** Profile pictures and community cover images are **generated avatars**: initials derived from the display name over a background colour derived deterministically from the entity's id, so the same user or community always renders the same colour. The only exception is Google sign-in, where the `picture` URL returned by Google is stored and displayed as-is. The schema keeps an `avatar_url` column so real uploads remain possible later without a migration, but no upload endpoint, storage bucket, or image-processing dependency is in scope.
- **Loading is a designed state.** Every screen that waits on the network has an explicit skeleton or spinner, not a blank area. This matters most on the post-submit flow (§7), where the wait is genuinely several seconds.

---

## 9. Use cases

The full UC list (UC-1 through UC-19) is in [docs/use cases.md](<docs/use cases.md>) (companion `docs/use cases.docx`). **Every feature must trace back to a UC.** Cite the UC number in commit messages, PR descriptions, and DEVELOPMENT.md entries.

- **UC-17 is withdrawn** (password reset). Its number is kept, not reused, so UC-18 keeps its identity.
- **UC-19 is new**: the administrative area — see §17.

---

## 10. Testing rules

- **File colocation**: `auth.service.ts` → `auth.service.test.ts` next to it. No global `/tests` folder.
- **AAA pattern**: every test reads as Arrange → Act → Assert.
- **Test database**: integration tests run against `music_app_test_db`, wiped and migrated before each suite. Never against the dev DB.
- **Mock external boundaries** in unit/integration: mock `google-auth-library`, mock the Playwright scraper. Save real browser interaction for E2E.
- Pyramid: many unit tests, fewer integration tests, a small handful of E2E tests covering the golden user loops (register → login → create community → post link → rate).

### What a feature must cover before it is Done

A feature is not finished when it works. It is finished when the following exist, each exercising **both the happy path and the failure paths**:

| Layer | Tool | Required coverage |
|---|---|---|
| Unit | Vitest | Every service function: the success case **and** every `AppError` branch it can throw. |
| Integration | Supertest | Every new endpoint: success, `400`/`422` invalid payload, `401` unauthenticated, `403` wrong permissions, `404` missing resource. |
| Component | Vitest + RTL | Every new interactive screen or form: renders, validates, and shows the error state. |
| E2E | Playwright | Golden loops only. Do not write an E2E test for something an integration test already proves. |

Bad-path tests are not optional padding — for this project they are the point. A PR with only happy-path tests gets sent back.

### Coverage threshold

- **80% line coverage is enforced in CI** via the Vitest coverage reporter, and a drop below it fails the build and blocks the merge.
- The threshold is a floor to catch untested branches, **not a target to game**. Never write an assertion-free test that merely executes a line to lift the number. If a file is genuinely not worth testing (generated Prisma client, config barrels, `main.tsx`), exclude it in the Vitest config with a comment explaining why — do not pad it with fake tests.

### CI gates (GitHub Actions)

Two workflows:

**`pr.yml` — runs on every pull request. All four jobs must be green to merge:**
1. `lint` — ESLint across both packages.
2. `typecheck` — `tsc --noEmit` across both packages.
3. `test:unit` — Vitest unit tests, both packages, with the coverage threshold applied.
4. `test:integration` — Supertest against a `postgres:16` service container running `music_app_test_db`.

Target wall-clock for the whole PR workflow is **under ~3 minutes**, so the feedback loop stays usable.

**`main.yml` — runs on push to `main` and on a nightly schedule:**
- Everything in `pr.yml`, plus `test:e2e` — the full Playwright suite against a built frontend and a live backend.

E2E is deliberately kept off the PR path: installing browsers plus running real flows costs many minutes and is the flakiest layer. Catching a regression at merge time rather than at PR time is the accepted trade-off. **If a nightly or post-merge E2E run goes red, fixing it takes priority over starting the next feature.**

---

## 11. Git workflow

### 🔴 Claude owns git entirely. The developer runs no git commands.

Every git and GitHub operation in this project is Claude's responsibility: creating branches, staging, committing, pushing, opening pull requests, filling in the PR body, **merging, and deleting branches**. The developer never types `git` anything.

**The developer's role is to decide *when*. Claude's role is to execute.** The developer says "merge it" or "close that branch"; Claude does the rest.

- **Never tell the developer to run a git command.** Run it.
- **Never leave work uncommitted** at the end of a step. Uncommitted work is Claude's failure, not a handoff.
- **Every step ends with a pushed branch and an open PR** against `main`, with the §11 template filled in.
- **Merging requires the developer's word.** Claude never merges on its own initiative, never enables auto-merge, and never pushes directly to `main`. An open PR waits until the developer says to merge it.
- **CI green is a hard precondition.** Once `pr.yml` exists (Step 0.5), Claude does not merge on a red or pending check even when told to — it reports the failure and fixes it first. This is the one remaining automated gate and it is not to be bypassed.
- **Merge style: squash and merge**, so `main` carries exactly one well-formed Conventional Commit per feature.
- **After merging**, Claude deletes the feature branch locally and on the remote, and checks out an updated `main` — without being asked again.
- **Deleting a branch that was never merged** always needs the developer to say so explicitly, because the work would be lost.

> **What this trades away, stated plainly.** There is no longer a human review of the diff before code reaches `main`. Claude's Stage 3 review pass (§15) and the CI gate are what remain. That is a deliberate choice by the developer for a solo project; it is not an invitation to lower the bar on the self-review, which now matters more, not less.

### Ask before anything outside the routine

The routine is everything the feature cycle needs, and Claude runs it without asking:

`checkout -b` · `add` · `commit` · `push` · `gh pr create` · `gh pr edit` · `gh pr view` · `gh pr checks` · `gh pr merge` (on the developer's word) · `branch -d` on a merged branch · `fetch` · `pull` · `prune` · `status` / `log` / `diff`

**Anything else, ask first — even when the answer is obviously yes.** A one-line question costs nothing; an unasked-for history rewrite costs an afternoon. Specifically:

- **Rewriting history**: `rebase`, `commit --amend`, `push --force` / `--force-with-lease`, `reset --hard`, `cherry-pick`, `revert`.
- **Bypassing a gate**: `--no-verify`, `gh pr merge --admin`, anything that skips a hook or a required check.
- **Deleting**: an unmerged branch, a tag, a release, a remote ref, or files in bulk.
- **Repository settings**: branch protection, visibility, collaborators, webhooks, Actions permissions, default branch.
- **Toolchain and dependencies**: adding, removing, or upgrading a package; changing Node or Postgres versions; altering the Docker base image.
- **Anything involving secrets** — see below.

State what the command does and why in one or two lines, then wait. If the developer says go, run it and report the result.

### Secrets are the developer's, always

The developer does not run commands — **except where a real secret value is involved**. Claude never sees, types, stores, or transmits a live credential. That means the developer personally handles:

- GitHub Actions repository secrets.
- Environment variables at the hosting provider (`DATABASE_URL`, `JWT_SECRET`).
- The Google Cloud Console OAuth client.

Claude's part is to say exactly which key is needed, where it goes, and how to generate it — then stop. Claude writes `.env.example` with blank values, never a populated `.env`.

### Merge conflicts

The workflow is designed so conflicts are rare: one feature, one branch, merged and deleted before the next begins. When one happens anyway:

**Claude does not resolve it silently.** Claude describes it briefly — which files, which two changes are in tension, and what each side would mean — and the developer decides. Then Claude executes the decision.

Conflicts in generated or mirrored files (a `.docx` mirror, a lockfile) are the exception: regenerate from source rather than hand-merging, and say that is what happened.

### Branch and commit rules

- **Never commit directly to `main`.** All changes go through a feature branch and a PR.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`. Use kebab-case names: `feat/google-oauth`, `fix/scraper-timeout`.
- **Conventional Commits** are mandatory:
  - `feat(auth): implement google oauth token verification`
  - `fix(scraper): add timeout handling for dom loading`
  - `chore: configure dockerfile for node backend`
  - Banned: `WIP`, `fixed a bug`, `added login`.
  - This is enforced by a `commitlint` commit-msg hook, not by memory. If a commit is rejected, fix the message — never bypass the hook with `--no-verify`.
- **PR description template**:
  ```
  ## Objective
  Implements UC-X: <short description>.

  ## Changes Made
  - …
  - …

  ## Testing Performed
  - [x] …
  - [x] …

  ## Notes for Review
  …
  ```
- **Self-review** every PR's "Files Changed" tab before merging. Look for stray `console.log`, commented-out code, missing error handling.
- **Vertical slicing**: each PR ships a complete DB → API → UI slice for one capability. Don't merge "backend only" without the screen that uses it.

---

## 12. Development strategy

The five-phase roadmap from [docs/development strategy.md](<docs/development strategy.md>) (companion `docs/development strategy.docx`) is the source of truth for ordering. Do not skip ahead. The full step-by-step breakdown is in [DEVELOPMENT.md](DEVELOPMENT.md):

1. **Phase 1** — Foundation & Identity (UC-1, 2, 3, 17)
2. **Phase 2** — Core Social Structures (UC-4, 9, 10, 14, 15)
3. **Phase 3** — The Magic Feature (UC-11 + Playwright scraper)
4. **Phase 4** — Engagement & Feedback (UC-12, 13, 16)
5. **Phase 5** — Social Discovery (UC-5, 6, 7, 8)

Phase 0 (local environment) and Phase 6 (CI + production hardening) are added in DEVELOPMENT.md as practical bookends.

---

## 13. 🔴 MANDATORY — Update DEVELOPMENT.md after every step

> **After every development step is finished, edit `DEVELOPMENT.md` and fill in:**
>
> - **What I did** — a concrete summary of the files added or changed and the behavior delivered. Reference the UC number(s) covered.
> - **How to view & test** — the exact shell commands to run (e.g. `cd backend && npm run dev`, `cd frontend && npm run dev`), the URLs to open (e.g. `http://localhost:5173/`), any seed data or sample inputs needed (e.g. "paste this Spotify link: …"), and the manual click-through to verify the change end-to-end. Include the test commands that cover the new code (e.g. `npm test -- auth.service`).
>
> **This update happens in the same commit / PR as the step itself.** A step is not "done" until DEVELOPMENT.md reflects what was built and how to confirm it works. Treat the README-style update as part of the deliverable, not paperwork.

If the step is partial (e.g. the backend half landed but the UI is still in flight), mark the step `🟡 In progress` and describe exactly what is and isn't usable yet.

---

## 14. Spec documents (`docs/`) — dual-file rule

`docs/` holds two different kinds of document, governed by two different rules.

### 14.1. Foundational specs — dual-file, `.docx` + `.md`

These are the long-lived documents that describe the system as a whole. Each exists as **two parallel files that must stay in sync**:

- `docs/<name>.docx` — the formatted document (open in Word / a docx viewer).
- `docs/<name>.md` — a plain-Markdown mirror of the same content, for fast reading and diffing (this is the version Claude reads by default).

> **🔴 MANDATORY — edit both files together.** Any change to a foundational spec must be applied to **both** the `.docx` and the `.md` of that document, in the same commit. Never let the two drift. If you only have time to update one, the spec change is not done.

The `.md` files were generated from the `.docx` originals; if you spot a conversion artifact in a `.md`, fix it against the `.docx` (which is authoritative for wording).

**The dual-file rule applies to exactly these twelve documents and to nothing else:**

`general`, `auth`, `tables`, `use cases`, `frontend screens`, `tech stack`, `system architecture conventions`, `git workflow`, `tests`, `development strategy`, `link converter implementation guide`, `deployment`.

### 14.2. Feature specs — `docs/features/<feature-name>.md`, Markdown only

The output of each feature specification session (§15) is a **single Markdown file** under `docs/features/`. **Do not create a `.docx` companion for a feature spec.** Keeping a binary mirror in sync per feature would produce unreadable diffs in the very PRs that most need review, for no benefit.

Use `docs/features/_TEMPLATE.md` as the starting point. Feature specs are living documents: if implementation reveals that the spec was wrong, fix the spec in the same PR rather than letting the code and the document disagree.

All documents in `docs/`, both kinds, are written in **English**.

---

## 15. How we work together — the feature session

Development proceeds **one feature at a time**. A feature is a vertically sliced, user-visible capability drawn from `DEVELOPMENT.md`. Each feature moves through four stages, in order, and **Claude does not start a stage before the previous one is genuinely finished**.

### Stage 1 — Specification session (conversation, no code)

Claude and the developer talk the feature through before anything is written. Claude asks about ambiguities, surfaces contradictions with existing specs, and proposes concrete options with trade-offs rather than open-ended questions.

The stage ends when Claude writes `docs/features/<feature-name>.md` covering:

- The UC number(s) this feature satisfies.
- What is in scope and, explicitly, what is **out** of scope.
- Schema changes (new tables, new columns, new migrations).
- API endpoints: method, path, request shape, response shape, every error code.
- Screens and components touched, including their loading, empty, and error states.
- Edge cases and failure modes.
- The scenario list Stage 4 will turn into tests — good paths and bad paths named individually.

**This document is approved by the developer before Stage 2 begins.** This is the approval gate; do not carry it over to a "plan" restated at implementation time.

### Stage 2 — Implementation

Build the whole vertical slice — migration, service, controller, route, screen — in one pass, following the spec. No test-writing yet beyond what is needed to make something run. If implementation reveals the spec was wrong, say so and amend the spec; do not silently diverge from it.

### Stage 3 — Review and improvement

Before writing tests, read back what was built and improve it: naming, duplication, error handling, missing loading states, anything that leaked through in the first pass. Confirm it conforms to §4 layering and §8 UI conventions. This is deliberately a separate stage so that tests are written against code that is already in its intended shape, rather than freezing a first draft in place.

**`/code-review` is mandatory in this stage.** Since the human review of the diff was removed (§11), Stage 3 is the only quality gate standing between a feature and `main`. A self-review by the author is the weakest form of review there is — the same reasoning that produced the code approves it. `/code-review` runs a separate pass over the diff instead, which is materially better than nothing. Run it, work through the findings, and say in the PR what it surfaced and what was done about each item.

**`/security-review` is mandatory for any feature touching authentication, authorisation, user input, or an external service.** In practice: all of Phase 1, the admin area (§17), the link scraper (§7), and the Phase 6 deployment work.

> `/code-review ultra` runs a deeper multi-agent review in the cloud. It is **user-triggered and billed — Claude cannot launch it.** Ask the developer to run it for a change that warrants the extra depth.

Neither command replaces the developer. They replace nothing that exists today; they are an addition to a stage that was otherwise unverified.

### Stage 4 — Tests

Write the test suite described in §10, working from the scenario list in the feature spec. Every named good path and every named bad path gets a test. Run the full suite, get it green, and confirm the coverage threshold holds.

### Closing the feature

Only after Stage 4 is green:

1. Update `DEVELOPMENT.md` per §13 — this is mandatory and is part of the same commit.
2. Commit, push, and open the PR (§11).
3. Report to the developer: what was built, what the tests cover, anything left as debt.

### Rules that hold across all four stages

- **One feature at a time.** Do not start the next feature's spec session while the current PR is open and unmerged.
- **Never skip Stage 1.** "This one is small" is exactly when the spec session is cheapest and the misunderstanding is most likely.
- **Tests are never deferred to a later PR.** A feature without its tests is not a feature, it is a liability.
- Feature-level product questions belong in Stage 1 of that feature, not in general planning conversations. Do not ask the developer to decide the details of a feature that is not currently being specified.

---

## 16. Deployment & PWA

The full specification is in [docs/deployment.md](docs/deployment.md) (companion `docs/deployment.docx`). Summary of the binding decisions:

### Deployment

- The target is a **real, publicly reachable deployment**, on the simplest option available, with a strong preference for free tiers.
- **The specific provider is deliberately not chosen yet — it is a Phase 6 decision.** Free-tier terms change often, so the candidates are compared and the final call is made when Phase 6 is actually reached, against the terms in force at that time.
- Until then, **keep the code provider-agnostic**: all configuration via environment variables, no provider SDKs, no vendor-specific build steps, nothing in the code that assumes a particular host. The backend Dockerfile stays the deployment unit.
- The hard constraint that drives the eventual choice: the backend runs headless Chromium, which needs meaningfully more memory than a plain Node service, and free tiers are tight. §7's `p-limit(2)` cap exists for this reason.

### PWA — full, including offline

The PWA is a product requirement, not a nice-to-have, because the intended everyday surface is an iPhone home-screen app. Scope:

- `manifest.webmanifest` with `display: standalone`, theme and background colours, and a complete icon set including the iOS `apple-touch-icon` sizes.
- iOS-specific meta tags, since Safari does not honour the manifest for everything.
- A **service worker via `vite-plugin-pwa`**: precache the app shell, runtime-cache the feed and album art, and serve a designed offline fallback page rather than the browser's error.
- **Offline read is supported; offline write is not.** A user with no connection can open the app and read a previously loaded feed and their own lists. Posting, rating, and bookmarking require connectivity and must show a clear "you're offline" state rather than failing silently or queueing invisibly.
- A **version-update flow**: when a new service worker is waiting, prompt the user to reload. Never let a stale shell sit indefinitely against a newer API.

> ⚠️ Service workers are the single most common source of "why am I seeing the old version" confusion. Register the service worker **only in production builds**, never in the Vite dev server, and always test a PWA change against a production build.

---

## 17. Administrative area (UC-19)

An admin area owned by the product owner, scheduled for **Phase 2** so that users and communities can be managed while the app is being trialled with real friends.

### Fixed decisions

- **Gated on `users.role = 'ADMIN'`.** The role is set **directly in the database** — there is no endpoint that grants admin, therefore no endpoint to abuse.
- **Authorisation is server-side on every admin endpoint.** Hiding the nav entry in the frontend is presentation, not security.
- A non-admin hitting an admin route gets `403`, and the frontend renders the standard not-found page rather than confirming the area exists.
- **The user list cannot show an email address, because none is stored** (§5). It shows username, display name, preferred service, join date, and activity counts — nothing that identifies a real person. This constraint is the reason the auth design looks the way it does.
- Every configuration change is recorded with who made it and when.

### Deliberately not decided here

Exactly which settings are configurable, whether content as well as design is editable, the shape of the settings table, and what the audit trail stores — **all of that belongs to this feature's Stage 1 specification session** (§15) and lands in `docs/features/admin-panel.md` before a single migration is written. Do not design it in a general planning conversation, and do not let it grow into a CMS by accident.

---

## 18. 🔴 Every external dependency gets documented

**The first time the project uses a new external service, connector, skill, or development tool, it is recorded — in the same commit that introduces it.** Not later, not in a cleanup pass. An undocumented dependency is one nobody knows to renew, replace, or remove.

Two destinations, deliberately kept apart:

| What | Where | Test for which one |
|---|---|---|
| Something the **running application** depends on | `docs/tech stack.md` §5 (+ `.docx`) | If it disappeared, would the deployed product break? |
| Something that helps us **build** it | `docs/tech stack.md` §5.2 (+ `.docx`) | If it disappeared, would only our workflow get slower? |

Keeping them separate matters: someone reading the stack to stand the app up needs to know that `squigly.link` is load-bearing and that `/code-review` is not.

For each entry record **what it is, why it was chosen, what breaks without it, and any account, key, or cost it carries.** A bare name in a list is not documentation.

The same rule applies to removal: a service that stops being used is deleted from the document, with its rejection recorded under the "deliberately not used" note if it might otherwise be reintroduced.
