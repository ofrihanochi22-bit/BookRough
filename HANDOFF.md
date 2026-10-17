# HANDOFF.md — Where BookRough Stands

A snapshot for picking the project up again after a break, possibly from a different Claude account. Written **2026-10-17**, at `main` = `9821d7a` (PR #35).

It summarises; it does not replace. The binding documents are:

| Read                                     | For                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                   | The working agreement: stack, conventions, git ownership, the four-stage feature cycle |
| [DEVELOPMENT.md](DEVELOPMENT.md)         | Every step: what was built, and how to view and test it                                |
| [docs/features/](docs/features/)         | One spec per feature, with its decisions and test scenarios                            |
| [docs/deployment.md](docs/deployment.md) | Hosting decision and production setup                                                  |

If this file and one of those disagree, they win.

---

## 1. What BookRough is

A social app for friend groups to share, rate and discuss music. Paste a Spotify link, and a friend on Apple Music sees an Apple Music link in the same post — converted server-side by headless Chromium (Playwright) scraping `squigly.link`.

Live at **https://bookrough.vercel.app** — public, but **not yet shared with friends** (that waits for Step 6.4). Desktop browser plus an installable iPhone PWA.

Stack in one line: React + Vite + TS + Tailwind + Zustand / Express + TS + Prisma + PostgreSQL / Google Sign-In only / Vitest, Supertest, Playwright / Vercel (Hobby) + Neon (Free), both Frankfurt.

---

## 2. Progress

**Feature-complete for every use case.** Phases 0–5 are done; Phase 6 (shipping) is half done.

| Phase                    | Steps                                                                                                                                    | PRs      | Status |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| 0 — Local environment    | Postgres in Docker, Express bootstrap, frontend shell, ESLint/Prettier/Husky/commitlint, CI gate                                         | #10, #11 | ✅     |
| 1 — Identity             | Google sign-in (UC-1/2/3), Complete Your Profile, E2E golden loop with a Google stand-in                                                 | #14–#16  | ✅     |
| 2 — Social structures    | Create community (UC-9), invite links + join (UC-15), roles/removal/bans (UC-10/14), My Profile (UC-3/4), admin lists + settings (UC-19) | #17–#22  | ✅     |
| 3 — The magic feature    | Post a link + feed + scraper (UC-11), delete post (UC-18), backend Docker image                                                          | #23–#25  | ✅     |
| 4 — Engagement           | Bookmarks / My List (UC-12), rate (UC-13), post detail (UC-16)                                                                           | #26–#28  | ✅     |
| 5 — Social discovery     | Find people (UC-5), friend requests (UC-6/7), unfriend (UC-8), invite friends to a community (UC-9)                                      | #29–#32  | ✅     |
| 6 — Shipping             | 6.3 production deploy, 6.1 installable PWA, 6.3a deployment-storage fix                                                                  | #33–#35  | ✅     |
| 6 — Shipping (remaining) | **6.2 PWA offline**, **6.4 production hardening**, **6.5 README**                                                                        | —        | ☐      |

UC-17 (password reset) is withdrawn; its number is not reused.

Last measured (Step 6.3/6.1): backend 829 tests at 98.85% lines, frontend 600 tests at 98.76%, E2E 41 runs (+3 skipped). CI floor is 80%.

---

## 3. What comes next, in order

Phase 6 was re-sliced on 2026-10-10 to ship in this order: 6.3 → 6.1 → **6.2 → 6.4 → 6.5**.

1. **Step 6.2 — PWA offline** (`feat/pwa-offline`, spec `docs/features/pwa-offline.md` not yet written). Starts with a Stage 1 spec session. Adds `vite-plugin-pwa` (a new dependency — ask first, CLAUDE.md §11), app-shell precache, runtime cache for feed and album art (never auth or mutations), an offline fallback page, explicit "you're offline" on write actions, and an update prompt. The service worker is registered in production builds only. The branch must opt in to a Vercel preview by adding its exact name to `vercel.json` → `git.deploymentEnabled`, and remove it before merge.
2. **Step 6.4 — Production hardening** (`chore/production-hardening`). Its task list is stale: the rate-limiting line predates Google-only auth (the only auth endpoint is `POST /api/auth/google`). Also: confirm the `p-limit(2)` cap under a burst, audit logs for PII, scan history for secrets, switch production deploys to Vercel Deployment Checks on `test:e2e` / `test:docker`. **The address goes to friends only after this merges.**
3. **Step 6.5 — README** (`docs/readme-deploy`).

---

## 4. Open loose ends the developer owes (dashboard actions)

Carried over from Claude's memory, which may not move with the account:

- [ ] **Production check after PR #35:** post a real Spotify link on production and confirm an Apple Music link appears (deployment-storage check S3).
- [ ] **Vercel → Deployments:** delete previews `fc544ec` and `08d09ef`. After S3 passes, also delete production `b8a0052`, "Redeploy of 3Uc8Jbktn" and "Production rebuild of…". Keep `c7da76b` (rollback) for about a week, then optionally delete.
- [ ] **Vercel → Usage:** a day after the deletions, confirm Function Storage dropped (S4). Hobby has 10 GB of deployment storage; it reached 75% before the fix.
- [ ] **Step 6.3 check P10 — due 2026-10-18:** after a week live, check Vercel and Neon usage against the free quotas.
- [ ] At Step 6.2: if the opted-in branch builds no preview, create one by hand (Deployments → Create Deployment).

---

## 5. Accounts and secrets — all the developer's, none tied to Claude

Changing Claude accounts touches none of these. Claude never holds a secret value (CLAUDE.md §11).

| Service              | What lives there                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub               | `ofrihanochi22-bit/BookRough`; `main` is protected by `pr.yml`'s four checks; squash merge only                                                                                                                              |
| Vercel (Hobby)       | Project `bookrough`, region `fra1`; env vars per environment (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, `LOG_LEVEL`, `VITE_GOOGLE_CLIENT_ID`); Deployment Protection "Require Log In" on for previews |
| Neon (Free)          | Project `bookrough-frankfurt`; branch `production` and branch `preview` (shared by every preview — reset it from its parent if a migration breaks it)                                                                        |
| Google Cloud Console | The OAuth web client: JavaScript origins `http://localhost:5173` and `https://bookrough.vercel.app` (origins, not redirect URIs)                                                                                             |
| Local                | `backend/.env` and `frontend/.env`, copied from their `.env.example` files                                                                                                                                                   |

The one admin account has `users.role = 'ADMIN'`, set directly in Neon — no endpoint grants it.

---

## 6. Running it locally

Prerequisites: Node ≥ 24, Docker Desktop (the developer starts it), `gh` signed in.

```bash
docker compose up -d
```

```bash
cd backend && npm install && npx prisma migrate dev && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173/`. Postgres is on port **5433**; integration tests use `music_app_test_db`. `.claude/launch.json` defines `frontend`, `frontend-preview` (production build on 4173 — the only place to judge PWA work) and `backend`.

Test commands:

```bash
npm run lint && npm run typecheck
```

```bash
cd backend && npm run test:coverage
```

```bash
cd frontend && npm run test:unit
```

```bash
npm test --prefix e2e
```

---

## 7. How the developer likes to work

The rules are in CLAUDE.md; these preferences were in Claude's personal memory and are copied here so a new account starts with them.

- **Language.** Converse in Hebrew; render all Hebrew right-to-left (CLAUDE.md §19). Keep English technical terms untranslated inside Hebrew sentences. Questions put to the developer are in English — **with a full Hebrew translation in RTL alongside** (context, an example, every option with pros and cons, the recommendation). If a question is not understood, re-explain it in **two short English sentences**.
- **Spec sessions (Stage 1): one question per message.** Hold the rest; after each answer, drill deeper or move on.
- **No visual-design questions in spec sessions.** Pick the simplest placeholder that reuses existing primitives and semantic tokens, say so, and move on. Behaviour, scope and data questions are still asked.
- **Docker Desktop down?** Ask the developer to start it — don't launch it. Meanwhile continue with work that doesn't need the database; once confirmed, `docker compose up -d` is routine.
- **Claude owns git** end to end — branch, commit, push, PR, and merge on the developer's word, CI green first. Ask before anything outside the routine list in CLAUDE.md §11 (history rewrites, new dependencies, settings, secrets).
- **Every feature** goes spec → implement → review (`/code-review`, plus `/security-review` where relevant) → tests, and closes with DEVELOPMENT.md updated in the same PR.

---

## 8. Starting a new session

Open the folder in Claude Code and begin with something like:

> Read CLAUDE.md, HANDOFF.md and the Phase 6 section of DEVELOPMENT.md. Then start the Stage 1 spec session for Step 6.2 (PWA offline).

Before that, check `gh auth status` and that the GitHub app / CLI can still push to the repository from the new setup.
