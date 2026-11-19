# HANDOFF.md — Where BookRough Stands

A snapshot for picking the project up again after a break, possibly from a different Claude account. Written **2026-10-17**, at `main` = `9821d7a` (PR #35); refreshed **2026-11-19**, at `main` = `f6593cb` (PR #86).

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

Production address: **https://bookrough.vercel.app** — public, but **not yet shared with friends** (that waits for Step 6.4's production checks, §3). Desktop browser plus an installable iPhone PWA.

> **Production is up.** The Vercel team was paused from 2026-10-12 to 2026-11-11 for Images Storage (17.16 GB of the Hobby team's 10 GB). It was redeployed on 2026-11-11, and `/api/health` answered `200` on 2026-11-19. Storage is now guarded by two project skills run around every merge: `/vercel-usage` before it and `/vercel-image-cleanup` after it (CLAUDE.md §16).

Stack in one line: React + Vite + TS + Tailwind + Zustand / Express + TS + Prisma + PostgreSQL / Google Sign-In only / Vitest, Supertest, Playwright / Vercel (Hobby) + Neon (Free), both Frankfurt.

---

## 2. Progress

Phases 0–5 are done; Phase 6 (shipping) is built except Step 6.5 (README), and waits on production checks. **UC-20 (direct recommendations), UC-21 (notifications) and UC-22 (discussion threads) are new** since the original plan.

| Phase                    | Steps                                                                                                                                    | PRs      | Status |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| 0 — Local environment    | Postgres in Docker, Express bootstrap, frontend shell, ESLint/Prettier/Husky/commitlint, CI gate                                         | #10, #11 | ✅     |
| 1 — Identity             | Google sign-in (UC-1/2/3), Complete Your Profile, E2E golden loop with a Google stand-in                                                 | #14–#16  | ✅     |
| 2 — Social structures    | Create community (UC-9), invite links + join (UC-15), roles/removal/bans (UC-10/14), My Profile (UC-3/4), admin lists + settings (UC-19) | #17–#22  | ✅     |
| 3 — The magic feature    | Post a link + feed + scraper (UC-11), delete post (UC-18), backend Docker image                                                          | #23–#25  | ✅     |
| 4 — Engagement           | Bookmarks / My List (UC-12), rate (UC-13), post detail (UC-16)                                                                           | #26–#28  | ✅     |
| 5 — Social discovery     | Find people (UC-5), friend requests (UC-6/7), unfriend (UC-8), invite friends to a community (UC-9)                                      | #29–#32  | ✅     |
| 6 — Shipping             | 6.3 production deploy, 6.1 installable PWA, 6.3a deployment-storage fix                                                                  | #33–#35  | ✅     |
| 6 — Shipping (later)     | 6.1a–6.1z4 (UC-20, link-only posts, notes N1–N10, the Mixtape redesign, the 2026-11-12 fixes, admin overview and delete), 6.2, 6.4       | #39–#86  | ✅     |
| 6 — Shipping (remaining) | Production checks for 6.2 (O1–O9) and 6.4 (P2–P7), **6.5 README**                                                                        | —        | 🟡 / ☐ |

UC-17 (password reset) is withdrawn; its number is not reused.

What landed after PR #35, in short (DEVELOPMENT.md has every step):

- **6.1a–6.1b:** direct recommendations (UC-20, PR #39) and link-only posts for Bandcamp, SoundCloud and live YouTube videos (PR #41).
- **6.1c–6.1i, the manual-test notes N1–N10** (`docs/manual-tests/2026-11-04.md`): visible sign-out, the notification center (UC-21), editing a post's comment, separate Sign in and Create account, role notifications, photo uploads (adds `sharp`) and discussion threads (UC-22), PRs #46–#53.
- **6.1j–6.1p, the "Mixtape" UI redesign**, PRs #54–#60, then the onboarding tutorial (N4, PR #61) and new icons (PR #63).
- **6.1s–6.1y, the 2026-11-12 improvement round** (`docs/manual-tests/2026-11-12-fixes.md`), PRs #65–#71.
- **Ops tooling:** the `/vercel-usage` and `/vercel-image-cleanup` skills and the `prune-deployments` job (PRs #73–#79). Registry pruning from CI was withdrawn, because Vercel answers `403` to every registry call on Hobby.
- **6.2 PWA offline** merged as PR #40 on 2026-11-17; its iPhone checks run on production.
- **6.1z–6.1z4:** Admin → Overview (PR #81), a lint guard against raw SQL built from text (PR #82), admin delete of users and communities (PR #84), and the conversion failure notice with Try again (PRs #85, #86).

Last measured (Step 6.4): backend 1,245 tests at 98.98% lines over both suites, frontend 747 tests at 98.67%; later steps record their own runs in DEVELOPMENT.md. CI floor is 80%.

---

## 3. What comes next, in order

1. **Step 6.4 production checks P2–P7** (`docs/features/production-hardening.md`): iPhone sign-in and the sign-in rate limit, a real Spotify → Apple Music post (also deployment-storage check S3), and the rest of the list. **The address goes to friends only after P2–P7 pass.**
2. **Step 6.2 iPhone checks O1–O9** (`docs/features/pwa-offline.md` §7), on production.
3. **Real link-only posts on production:** one Bandcamp, one SoundCloud and one KEXP link; check each card's title, cover and platform button. And one direct recommendation between two Google accounts.
4. **Step 6.5 — README** (`docs/readme-deploy`).

---

## 4. Open loose ends the developer owes (dashboard actions)

Done since the pause ended on 2026-11-11:

- [x] The site came back and `main` was redeployed on 2026-11-11; every pending migration applied on Neon.
- [x] `TRUST_PROXY_HOPS` = `1` (Production and Preview), Deployment Checks `test:e2e` and `test:docker`, and Preview retention of one week.
- [x] A team-scoped Vercel token in the GitHub secret `VERCEL_TOKEN` (replaced 2026-11-16, **expires 2027-05-15**), the variable `VERCEL_TEAM` = `bookrough`, and `PRUNE_DEPLOYMENTS` = `delete`.
- [x] The answer to deployment-storage S5: deleting a deployment does **not** free its registry image, so `/vercel-image-cleanup` deletes unused images after each merge.

Still open:

- [ ] Step 6.4 checks P2–P7 and Step 6.2 checks O1–O9 (§3).
- [ ] **Step 6.3 check P10, overdue since 2026-10-18:** check Neon usage against its free quotas.
- [ ] Delete the obsolete GitHub variable `PRUNE_IMAGES`, if it was ever created.
- [ ] Claude will ask before making `checks / secrets` a required check in branch protection.

---

## 5. Accounts and secrets — all the developer's, none tied to Claude

Changing Claude accounts touches none of these. Claude never holds a secret value (CLAUDE.md §11).

| Service              | What lives there                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub               | `ofrihanochi22-bit/BookRough`; `main` is protected by `pr.yml`'s checks; squash merge only                                                                                                                                   |
| Vercel (Hobby)       | Project `bookrough`, region `fra1`; env vars per environment (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, `LOG_LEVEL`, `VITE_GOOGLE_CLIENT_ID`); Deployment Protection "Require Log In" on for previews |
| Neon (Free)          | Project `bookrough-frankfurt`; branch `production` and branch `preview` (shared by every preview — reset it from its parent if a migration breaks it)                                                                        |
| Google Cloud Console | The OAuth web client: JavaScript origins `http://localhost:5173` and `https://bookrough.vercel.app` (origins, not redirect URIs)                                                                                             |
| GitHub Actions       | Secret `VERCEL_TOKEN` (team-scoped Vercel token for deployment pruning, expires 2027-05-15); variables `VERCEL_TEAM`, `PRUNE_DEPLOYMENTS` (`PRUNE_IMAGES` is obsolete since 2026-11-16 and can be deleted)                   |
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

> Read CLAUDE.md, HANDOFF.md and the Phase 6 section of DEVELOPMENT.md. Then help me run the production checks in HANDOFF.md §3.

Before that, check `gh auth status` and that the GitHub app / CLI can still push to the repository from the new setup.
