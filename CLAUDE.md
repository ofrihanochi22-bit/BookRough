# CLAUDE.md — BookRough Working Agreement

This file is the working contract between the developer and Claude. Read it before touching any code in this repository. The full feature roadmap lives in [DEVELOPMENT.md](DEVELOPMENT.md).

---

## 1. Project overview

**BookRough** is a social platform that lets friend groups share, rate, and discuss music recommendations across different streaming services. The "magic" feature is automatic universal-link conversion: a user pastes a Spotify link, and a friend on Apple Music sees an Apple Music link in the same post. Conversion is performed server-side via a Playwright headless browser scraping `squigly.link`.

---

## 2. Tech stack

**Frontend** (`frontend/`)
- React + Vite + TypeScript
- Tailwind CSS for styling
- Zustand for global state (auth session, preferred streaming service)
- `@react-oauth/google` for the Google login popup
- React Router for routing
- Axios for HTTP

**Backend** (`backend/`)
- Node.js + Express + TypeScript
- Prisma ORM on PostgreSQL
- `jsonwebtoken` for app session tokens (HttpOnly cookie)
- `bcrypt` for password hashing
- `google-auth-library` for verifying Google identity tokens server-side
- `playwright` (headless Chromium) for the link-conversion scraper
- Pino for structured logging
- Zod for request validation

**Database**
- PostgreSQL (single instance, separate `music_app_test_db` for integration tests)

**Tests**
- Vitest as test runner
- React Testing Library for components
- Supertest for backend integration tests
- Playwright for E2E

**Infra**
- Docker (backend image is based on `mcr.microsoft.com/playwright` so Chromium dependencies are available)
- GitHub Actions for CI

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
│   ├── index.html
│   └── vite.config.ts
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
  - On `401`: clears the auth store and redirects to `/login`.
  - On any `4xx`/`5xx`: shows a toast with the backend's `message`.
- Wrap the routed app in a React Error Boundary so a component crash shows a localized fallback instead of a white screen.

### Logging

- Pino, with levels `ERROR` / `WARN` / `INFO` / `DEBUG`.
- Every log line includes `timestamp`, `level`, `context` (module name), `message`.
- Include `userId` in metadata when relevant. **Never log passwords, tokens, or raw PII.**
- `console.log` is banned in committed code.

---

## 5. Authentication conventions

- Dual login: **email + bcrypt password** OR **Google OAuth 2.0**.
- Both flows end the same way: backend issues a unified app JWT, set as an `HttpOnly`, `Secure` cookie named `token`.
- Google flow:
  1. Frontend uses `@react-oauth/google` `<GoogleLogin>` to obtain a Google identity token.
  2. Frontend `POST`s the token to `/api/auth/google`.
  3. Backend verifies the token with `google-auth-library` (audience = `GOOGLE_CLIENT_ID`).
  4. Backend looks up the user by email, creates one if missing (`password_hash = null`), and issues the app JWT.
  5. New Google users are redirected to a **Complete Your Profile** screen to set `username` and `preferred_service` before reaching the dashboard.
- Account collision handling: if a Google user's email matches an existing email/password account, the two are linked silently — same row, just a new login method.

---

## 6. Database

The schema is defined in `backend/prisma/schema.prisma`. The full table-by-table contract is in `tables.docx`. Eight tables in total:

`users`, `communities`, `community_members`, `friends`, `posts`, `ratings`, `bookmarks`, `password_resets`.

Always create migrations via `npx prisma migrate dev --name <descriptive-name>`. Never edit a migration after it has been applied; create a new one.

---

## 7. Link converter (Playwright)

- Lives in `backend/src/services/linkScraper.service.ts`.
- Headless Chromium with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`.
- Block `image`, `stylesheet`, `font`, `media` requests to save memory and time.
- `page.waitForSelector` timeout = **8 seconds**, not the default 30.
- Browser is closed in a `finally` block — always.
- **Fail gracefully**: if scraping throws, save the post with `original_url` only and a `conversion_pending` flag. Don't drop the user's content.
- Production runs inside the `mcr.microsoft.com/playwright` Docker base image (Chromium system deps preinstalled).

---

## 8. Frontend screens

The full screen catalog is in `frontend screens.docx`. Thirteen screens, four groups:

- **Auth & Onboarding**: Welcome, Registration, Login, Forgot Password, Create New Password.
- **Main Navigation & Social**: Communities Dashboard (home), Global Search, Friends & Requests, Public User Profile.
- **Community & Music**: Community Feed, Create Community, Community Settings & Members, Post Detail / Feedback.
- **Personal**: My List (Listen Later), Submit Rating modal, My Profile / Settings.

Mobile-first layouts; Tailwind responsive utilities.

---

## 9. Use cases

The full UC list (UC-1 through UC-18) is in `use_cases.docx`. **Every feature must trace back to a UC.** Cite the UC number in commit messages, PR descriptions, and DEVELOPMENT.md entries.

---

## 10. Testing rules

- **File colocation**: `auth.service.ts` → `auth.service.test.ts` next to it. No global `/tests` folder.
- **AAA pattern**: every test reads as Arrange → Act → Assert.
- **Test database**: integration tests run against `music_app_test_db`, wiped and migrated before each suite. Never against the dev DB.
- **Mock external boundaries** in unit/integration: mock `google-auth-library`, mock the Playwright scraper. Save real browser interaction for E2E.
- **CI gate**: `npm test` must pass on every PR. A red CI blocks merge.
- Pyramid: many unit tests, fewer integration tests, a small handful of E2E tests covering the golden user loops (register → login → create community → post link → rate).

---

## 11. Git workflow

- **Never commit directly to `main`.** All changes go through a feature branch and a PR.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`. Use kebab-case names: `feat/google-oauth`, `fix/scraper-timeout`.
- **Conventional Commits** are mandatory:
  - `feat(auth): implement google oauth token verification`
  - `fix(scraper): add timeout handling for dom loading`
  - `chore: configure dockerfile for node backend`
  - Banned: `WIP`, `fixed a bug`, `added login`.
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

The five-phase roadmap from `development strategy.docx` is the source of truth for ordering. Do not skip ahead. The full step-by-step breakdown is in [DEVELOPMENT.md](DEVELOPMENT.md):

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
> - **How to view & test** — the exact shell commands to run (e.g. `cd backend && npm run dev`, `cd frontend && npm run dev`), the URLs to open (e.g. `http://localhost:5173/login`), any seed data or sample inputs needed (e.g. "paste this Spotify link: …"), and the manual click-through to verify the change end-to-end. Include the test commands that cover the new code (e.g. `npm test -- auth.service`).
>
> **This update happens in the same commit / PR as the step itself.** A step is not "done" until DEVELOPMENT.md reflects what was built and how to confirm it works. Treat the README-style update as part of the deliverable, not paperwork.

If the step is partial (e.g. the backend half landed but the UI is still in flight), mark the step `🟡 In progress` and describe exactly what is and isn't usable yet.
