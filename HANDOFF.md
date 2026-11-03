# HANDOFF.md — Where BookRough Stands

A snapshot for picking the project up again after a break, possibly from a different Claude account. Written **2026-10-17**, at `main` = `9821d7a` (PR #35); production status, §3 and §4 updated **2026-11-02**.

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

Production address: **https://bookrough.vercel.app** — public, but **not yet shared with friends** (that waits for Step 6.4). Desktop browser plus an installable iPhone PWA.

> 🔴 **Production is down: the Vercel team has been paused since 2026-10-12, until 2026-11-11.** Images Storage reached 17.16 GB of the Hobby team's 10 GB. The site answers `402 Payment required — DEPLOYMENT_DISABLED`. See §4 — this comes before any new feature.

Stack in one line: React + Vite + TS + Tailwind + Zustand / Express + TS + Prisma + PostgreSQL / Google Sign-In only / Vitest, Supertest, Playwright / Vercel (Hobby) + Neon (Free), both Frankfurt.

---

## 2. Progress

Phases 0–5 are done; Phase 6 (shipping) is half done. **UC-20, direct recommendations between friends, is new** and is built on `feat/direct-recommendations` (Step 6.1a).

| Phase                    | Steps                                                                                                                                    | PRs      | Status |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| 0 — Local environment    | Postgres in Docker, Express bootstrap, frontend shell, ESLint/Prettier/Husky/commitlint, CI gate                                         | #10, #11 | ✅     |
| 1 — Identity             | Google sign-in (UC-1/2/3), Complete Your Profile, E2E golden loop with a Google stand-in                                                 | #14–#16  | ✅     |
| 2 — Social structures    | Create community (UC-9), invite links + join (UC-15), roles/removal/bans (UC-10/14), My Profile (UC-3/4), admin lists + settings (UC-19) | #17–#22  | ✅     |
| 3 — The magic feature    | Post a link + feed + scraper (UC-11), delete post (UC-18), backend Docker image                                                          | #23–#25  | ✅     |
| 4 — Engagement           | Bookmarks / My List (UC-12), rate (UC-13), post detail (UC-16)                                                                           | #26–#28  | ✅     |
| 5 — Social discovery     | Find people (UC-5), friend requests (UC-6/7), unfriend (UC-8), invite friends to a community (UC-9)                                      | #29–#32  | ✅     |
| 6 — Shipping             | 6.3 production deploy, 6.1 installable PWA, 6.3a deployment-storage fix                                                                  | #33–#35  | ✅     |
| 6 — Shipping (remaining) | **6.1a direct recommendations (UC-20)**, **6.2 PWA offline** (on a branch, untested), **6.4 production hardening**, **6.5 README**       | —        | 🟡 / ☐ |

UC-17 (password reset) is withdrawn; its number is not reused.

**Step 6.1b — link-only posts (UC-11, amended), added 2026-11-03:** Bandcamp, SoundCloud and live YouTube videos shared without conversion (`docs/features/link-only-posts.md`). Built, reviewed and tested on `feat/link-only-posts`, in an open PR built while PR #40 waits; backend 68 test files at 99.01% lines, frontend 61 at 98.67%.

Last measured (Step 6.1a): backend 930 tests at 98.93% lines, frontend 659 tests at 98.67%, E2E 43 runs (+3 skipped). CI floor is 80%.

---

## 3. What comes next, in order

Phase 6 was re-sliced on 2026-10-10, and UC-20 joined on 2026-11-02, so it ships in this order: 6.3 → 6.1 → 6.3a → **6.1a → 6.2 → 6.4 → 6.5**.

0. **Get production back up** (§4) — nothing else can be checked on an iPhone until it is.
   0a. **Step 6.1b — link-only posts.** Its PR waits for the developer's word, green CI and the storage check (CLAUDE.md §16). Merging runs the `add_link_only_posts` migration on Neon with the next deployment. Whichever of it and PR #40 merges second adds `*.bcbits.com`, `*.sndcdn.com` and `i.ytimg.com` to Step 6.2's album-art cache. After deploying, post one real Bandcamp, SoundCloud and KEXP link on production.
1. **Step 6.1a — Direct recommendations (UC-20).** Built and tested on `feat/direct-recommendations`; its PR waits for the developer's word and the storage check (CLAUDE.md §16). Merging runs a migration on Neon when the next deployment starts, so it is expected after the pause ends.
2. **Step 6.2 — PWA offline — Stages 1–3 done, Stage 4 not started.** Branch `feat/pwa-offline` (pushed, **no PR yet**, last commit `fa0d46f`, 2026-10-11). Its spec `docs/features/pwa-offline.md` is approved and marks ☑ Spec · ☑ Implemented · ☑ Reviewed · ☐ Tested · ☐ Merged. The branch holds the spec, the implementation (`vite-plugin-pwa` 1.3.0 pinned — approved 2026-10-11; network-first `GET /api/*`, cache-first album art, remembered session for offline launch, `OfflineBar`, `UpdatePrompt`, sign-out wipes the caches) and one code-review fix-up commit. Its `DEVELOPMENT.md` entry is still ☐ — not yet updated.
   - It branched from `c7da76b` (PR #34), **before** PR #35 and Step 6.1a — bring it up to date with `main` first, after 6.1a merges.
   - Remaining: Stage 4 tests from the spec's scenario list, `/security-review` if the spec asks for it, the iPhone/airplane-mode and second-deploy checks, then `DEVELOPMENT.md` and the PR.
   - For an iPhone check the branch must opt in to a Vercel preview by adding its exact name to `vercel.json` → `git.deploymentEnabled`, and remove it before merge. The service worker is registered in production builds only.
3. **Step 6.4 — Production hardening** (`chore/production-hardening`). Its task list is stale: the rate-limiting line predates Google-only auth (the only auth endpoint is `POST /api/auth/google`), and it must also cover `POST /api/recommendations`. Also: confirm the `p-limit(2)` cap under a burst, audit logs for PII, scan history for secrets, switch production deploys to Vercel Deployment Checks on `test:e2e` / `test:docker`, and cap Vercel storage by pruning the registry to the 4 newest images (needs a `VERCEL_TOKEN` secret, and only once Images Storage has been seen to fall). **The address goes to friends only after this merges.**
4. **Step 6.5 — README** (`docs/readme-deploy`).

---

## 4. Open loose ends the developer owes (dashboard actions)

- [x] **Delete old images.** Done 2026-11-02: only the production image of `9821d7a` (395 MB) remains in the `bookrough` project's **Images** tab.
- [x] **Watch the meter fall.** Done 2026-11-03: Images Storage reads **394.68 MB** of 10 GB (it had read 16.31, 15.25 and 13.5 GB on 2026-11-02), Function Storage 2.37 GB. Deleting images does free the meter, gradually, within about a day. Step 6.4's image-pruning gate has therefore passed. Do not delete the repository or the last image.
- [ ] **On 2026-11-11:** confirm that `https://bookrough.vercel.app/api/health` answers `200`. The project may need resuming by hand from its overview. If the team stays paused, contact Vercel. If Vercel cannot be restored, the agreed fallback is Google Cloud Run (`docs/deployment.md` §3.6).
- [ ] **First deploying merge after the pause (S5):** compare Images Storage before and after it, to learn whether Vercel removes old images by itself (`docs/features/deployment-storage.md` §1.2). Until that is known, read both storage meters before every merge (CLAUDE.md §16).

Carried over from Claude's memory, which may not move with the account:

- [ ] **Production check after PR #35:** post a real Spotify link on production and confirm an Apple Music link appears (deployment-storage check S3).
- [ ] **Vercel → Deployments:** delete any old preview and production deployments that remain, keeping the current production one.
- [ ] **Vercel → Usage:** Function Storage has dropped to 2.37 GB of 10 GB (S4 passed); only Images Storage is still over.
- [ ] **Step 6.3 check P10 — overdue since 2026-10-18:** check Neon usage against its free quotas, and Vercel's after the pause.
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

> Read CLAUDE.md, HANDOFF.md and the Phase 6 section of DEVELOPMENT.md. Then help me get production back up (HANDOFF.md §4), and after that continue Step 6.2 on `feat/pwa-offline` at Stage 4 (tests).

Before that, check `gh auth status` and that the GitHub app / CLI can still push to the repository from the new setup.
