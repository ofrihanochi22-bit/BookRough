# Feature: Backend Docker image

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                         |
| ------------- | ----------------------------------------------------------------------- |
| **Use cases** | None directly — the deployment unit every UC runs in (CLAUDE.md §16)    |
| **Phase**     | 3 — Step 3.4 of `DEVELOPMENT.md` (a `chore/`, not a user-visible slice) |
| **Branch**    | `chore/backend-dockerfile`                                              |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged      |

---

## 1. Goal

`backend/Dockerfile` builds an image that runs the API — headless Chromium included — on any container host, so the Phase 6 deployment is a configuration change rather than new work. The container brings its own database schema up to date on start, and CI proves after every merge (and nightly) that the image still builds and serves.

## 2. Scope

**In scope**

- `backend/Dockerfile` (multi-stage) and `backend/.dockerignore`.
- A start command that runs `prisma migrate deploy`, then the API.
- A `test:docker` job in `main.yml`: build, run against the Postgres service, wait for health, prove the migrations ran.
- A manual smoke test in this PR, including one real squigly.link conversion inside the container.
- Doc updates (§9).

**Out of scope** — deliberately

- Choosing a host, a registry, or pushing the image anywhere — Phase 6 (`deployment.md` §3).
- A frontend image: the frontend is static files; how they are served is a Phase 6 decision.
- `docker-compose` for the app: `docker-compose.yml` stays local Postgres only (CLAUDE.md §3 — "never a deployment artifact").
- Building the image on pull requests (developer's choice, option A in Q3): it would break the ~3-minute PR budget.
- HTTPS, TLS, secrets management — the host's job in Phase 6.
- Running E2E against the container. The E2E suite keeps running against `node dist/index.js`; the image's job is to start and serve, which the smoke job proves.
- The Chromium sandbox: the converter keeps launching with `--no-sandbox` (CLAUDE.md §7). It only ever opens squigly.link, never a user's URL.

## 3. Data model changes

None.

## 4. The image

### 4.1 Base

`mcr.microsoft.com/playwright:v1.63.0-noble` (developer's choice, option A in Q1): Ubuntu 24.04 LTS, Node 24, and Chromium plus its system libraries pinned to the same 1.63.0 as the backend's `playwright` package. The tag is pinned exactly; moving Playwright later means moving `package.json` and this tag together (a comment in the Dockerfile says so).

The image also carries Firefox and WebKit (~2 GB in all). That costs pull time and registry space, not runtime memory, and was accepted to avoid a new decision.

### 4.2 Stages

1. **build** — `npm ci` (all dependencies), `prisma generate` (via `postinstall`), `npm run build` (`tsc` to `dist/`).
2. **runtime** — same base; `npm ci --omit=dev`; copies `dist/` and `prisma/` (schema and migrations) from the build stage. No source, no tests, no dev tooling.

### 4.3 Runtime details

- **User:** `pwuser` (the base image's non-root user), not root.
- **PID 1:** `tini`, so signals reach Node (our `SIGTERM` handler closes the server and Prisma) and any orphaned Chromium processes are reaped. This is the portable form of Docker's `--init`, which not every host lets us set.
- **Environment:** `NODE_ENV=production` is set in the image. Everything else comes from the host: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, `PORT` (default 4000), `LOG_LEVEL`. The env schema already refuses to start without the required ones, and refuses both E2E stand-ins outside `NODE_ENV=test`.
- **Start** (developer's choice, option A in Q2): `prisma migrate deploy && exec node dist/index.js`. A failed migration stops the container before the API serves anything; concurrent starts are safe because Prisma takes an advisory lock. `exec` hands the Node process the signals.
- **Port:** `EXPOSE 4000`; the host may set `PORT`.
- **Health:** a Docker `HEALTHCHECK` calls `GET /api/health` with `curl` (in the base image). That route deliberately does not touch the database, so a database blip does not restart a healthy container.
- **Chromium:** the base image's browsers at `/ms-playwright` (`PLAYWRIGHT_BROWSERS_PATH`) are used as-is; nothing is downloaded at build or run time. `--disable-dev-shm-usage` (CLAUDE.md §7) keeps Chromium off the small `/dev/shm` of most hosts, so `--ipc=host` is not required.

### 4.4 `.dockerignore`

`node_modules`, `dist`, `coverage`, `.env*` (secrets never enter the image), logs, and the local `.devtoken*` / `*.tmp.ts` scratch files.

### 4.5 Dependency changes (developer approval needed at the start of Stage 2)

- **`prisma` moves from `devDependencies` to `dependencies`**: the runtime stage runs `prisma migrate deploy`, and `npm ci --omit=dev` would otherwise leave the CLI out. Same version; no upgrade.
- **`tini`** is installed in the image with `apt-get` (Ubuntu package).

## 5. CI — `test:docker` in `main.yml`

Runs on push to `main` and nightly, alongside `test:e2e` (developer's choice, option A in Q3). Not on PRs.

1. `docker build -t bookrough-api backend`.
2. Start a `postgres:16` service with an empty `music_app_test_db`.
3. `docker run -d --network host` with CI-only values for the required env vars (no real secrets exist in CI).
4. Wait (up to 90 s) for `GET http://localhost:4000/api/health` → 200.
5. Prove the migrations ran: `GET /api/settings` → 200 (it reads `app_settings`, which exists only after the migrations).
6. `docker stop` returns within 10 s (graceful shutdown), and the logs contain no `error`-level line. On failure, the container logs are printed.

## 6. Edge cases & failure modes

- **A migration fails on start** → the container exits non-zero before listening; the host shows a crashed deploy instead of a running app with a broken schema.
- **A required env var is missing** → the env schema exits with the list of missing variables (existing behaviour).
- **An E2E stand-in variable set in production** → refused at start (existing behaviour).
- **The host sends `SIGTERM`** → tini forwards it; the server closes and Prisma disconnects.
- **A Chromium process outlives a conversion** → tini reaps it; the converter also closes every browser in `finally` (CLAUDE.md §7).
- **Playwright upgraded in `package.json` without the tag** → the browser path no longer matches and every conversion is `unavailable` (posts save as pending). The Dockerfile comment and `tech stack.md` say the two move together; the nightly live E2E test does not run in the container, so this is a documented manual rule.
- **Image built on ARM (Apple Silicon)** → the base image is multi-arch; nothing to do.

## 7. Test scenarios

No application code changes, so there are no new unit, integration or component tests; the existing suites must stay green.

**CI (`test:docker`, `main.yml`)**

- ✅ The image builds from a clean checkout.
- ✅ The container starts against an empty database, applies every migration, and `/api/health` answers 200.
- ✅ `/api/settings` answers 200 (proves the schema exists).
- ✅ `docker stop` exits within 10 s (proves signal handling through tini).
- ❌ Fails the job, with the container logs printed, if any of the above fails.

**Manual, in this PR (results in the PR description)**

- ✅ Build locally; run against the local Docker Postgres with a fresh database; health 200; migrations applied.
- ✅ The container runs as `pwuser`, with tini as PID 1.
- ✅ One real conversion inside the container: a script run inside it calls the converter on a known Spotify track and gets `converted` with five links.
- ❌ Start without `DATABASE_URL` → exits with the env error. Start with `E2E_SCRAPER_FIXTURES` set and `NODE_ENV=production` → refused.
- ✅ Image size and idle memory recorded (input for the Phase 6 host choice).

## 8. Open questions & risks

- **Image size (~2 GB)** — accepted in Q1; recorded for the Phase 6 decision.
- **Memory** — idle and during one conversion, measured in the manual smoke test and written to `deployment.md` as a Phase 6 input.
- **The Playwright tag must track `package.json`** — a documented manual rule (§6).

## 9. Doc updates in this PR

- `docs/deployment.md` + `.docx`: a new section on the backend image — how to build and run it, the environment variables, migrations on start, the health check, tini, and the measured size and memory.
- `docs/tech stack.md` + `.docx`: Docker — the exact base tag, the multi-stage build, tini; the rule that the tag tracks `playwright`.
- `docs/tests.md` + `.docx` §4.2: `main.yml` gains `test:docker`.
- CLAUDE.md §10 (`main.yml` adds `test:docker`) and §2 Infra (tini).
- `DEVELOPMENT.md`: Step 3.4 per §13; Phase 3 complete.

## 10. Decisions log

| Date       | Decision                                                              | Reason                                                                                |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-10-05 | Base image `mcr.microsoft.com/playwright:v1.63.0-noble` (option A)    | Already the recorded choice; Chromium and libraries pinned to our Playwright, Node 24 |
| 2026-10-05 | The container runs `prisma migrate deploy` on start (option A)        | Works on any host; never new code against an old schema; a failed migration is loud   |
| 2026-10-05 | CI builds and smoke-tests the image in `main.yml` only (option A)     | Keeps the PR budget; the image never rots unnoticed                                   |
| 2026-10-05 | Multi-stage build; the runtime stage has production dependencies only | Smaller attack surface; no source or dev tooling in the image                         |
| 2026-10-05 | Run as `pwuser` with `tini` as PID 1                                  | Non-root by default; signals and orphaned Chromium processes handled on any host      |
| 2026-10-05 | `prisma` moves to `dependencies`                                      | The runtime stage needs the CLI to migrate                                            |
