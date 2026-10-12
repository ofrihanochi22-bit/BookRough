### Deployment & Progressive Web App Specification

### 1. Objective

BookRough is not a local-only exercise. It must end up as a publicly reachable website that a small group of friends can genuinely use, in two forms:

1. **Desktop browser** — the secondary surface.
2. **Installed PWA on iPhone** — added to the home screen from Safari and launched full-screen, with no browser chrome. This is the primary everyday surface, because music sharing happens on phones.

Both are served from the same codebase and the same deployment. There is no separate native application.

### 2. Guiding constraints

Three constraints shape every decision in this document:

- **Cost.** Free tiers are strongly preferred. The project is not revenue-generating and must not require a recurring bill to stay online.
- **Simplicity.** Fewer moving parts wins over marginally better performance. The developer should be able to explain the whole deployment in a minute.
- **Chromium.** The backend runs headless Chromium via Playwright to scrape squigly.link. Chromium needs substantially more memory than a plain Node process, and free tiers are memory-constrained. This is the constraint that the others must bend around.

### 3. Provider selection — decided 2026-10-10

**Chosen on 2026-10-10: Vercel (Hobby) for the frontend and the API, Neon (Free) for Postgres, both in Frankfurt, with Google Cloud Run as the agreed fallback.** The decision is summarised in §3.6; the measurements, every candidate's terms on that date and the sources are in `docs/features/production-deploy.md` §3.1.

The choice was deferred to Phase 6 on purpose: free-tier terms change frequently — memory allowances, idle spin-down, and especially the lifetime of free managed databases — so they were verified at the moment of deciding rather than months earlier. §3.1–§3.4 record how the decision was framed beforehand.

#### 3.1. What the backend needs

- Runs a **Docker image** (required: the Playwright base image carries the Chromium system libraries).
- Enough memory for Node plus up to two concurrent Chromium instances.
- A persistent **PostgreSQL** database that is not deleted after a trial window.
- Environment-variable configuration.
- HTTPS with a valid certificate — non-negotiable, because the PWA service worker and the secure auth cookie both require it.

#### 3.2. Candidate shapes

**A. Split across three specialised free tiers.** Static frontend on a CDN host, managed Postgres on a database-specialist host, containerised backend on a container host. Each component sits on a provider that is good at that component, and the database is the piece most likely to have a genuinely durable free tier. Costs: three dashboards, three sets of credentials, and cross-origin configuration between frontend and backend.

**B. One provider for everything.** A single host running the backend container, the database, and the static frontend. One dashboard, one mental model, simplest to reason about and to explain. The risk concentrates in that provider's free-tier database terms — if free databases expire, the whole deployment needs migrating.

**C. A single small paid VPS with Docker Compose.** Complete control, predictable fixed cost, no tier games. But the developer becomes responsible for the operating system, TLS certificates, renewals, backups, and security updates. Rejected for now as disproportionate to the project, and it is not free.

#### 3.3. Known hazards to check at decision time

- **Free-tier database lifetime.** Several providers delete free databases after a fixed window. Verify before committing; a deployment that silently loses its data after a month is worse than none.
- **Idle spin-down.** Free container tiers commonly sleep after a period of inactivity, producing a long cold start on the next request. For a friend group posting a few times a day, this means a slow first load. Acceptable, but it should be a known trade-off rather than a surprise.
- **Memory ceiling versus Chromium.** A 512 MB instance running Node plus Chromium is tight. If the chosen tier proves too small, the mitigations, in order of preference, are: lower the `p-limit` concurrency cap to 1, then move the scraper to a separate worker, then pay.

#### 3.4. Provider-agnostic code (still the rule)

**Keep the code provider-agnostic.** Specifically:

- All configuration through environment variables. No hardcoded hostnames, regions, or connection strings.
- No provider-specific SDKs, no proprietary build plugins, no vendor lock-in in application code.
- The backend `Dockerfile` is the deployment unit and must stay runnable on any container host.
- Database access only through Prisma, so the Postgres instance can be moved by changing `DATABASE_URL`.

Written this way, the Phase 6 decision was a configuration change, not a rewrite — and moving to the fallback still is.
#### 3.5. The backend image (built in Phase 3)
`backend/Dockerfile` is the deployment unit (Step 3.4, `docs/features/backend-docker.md`). What any host needs to know:
- **Build:** `docker build -t bookrough-api backend`. Base `node:24.21.0-bookworm-slim` (Debian 12, Node 24) with only Chromium's headless shell and its system libraries, installed by the `playwright` package in the lockfile, so the browser always matches the library; a multi-stage build whose runtime stage holds production dependencies, `dist/` and the Prisma migrations only.
- **Run:** set `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, and optionally `PORT` (default 4000) and `LOG_LEVEL`. `NODE_ENV=production` is baked in, so both E2E stand-ins are refused.
- **Migrations run on start:** `prisma migrate deploy`, then the API. A failed migration stops the container before it serves; concurrent starts are safe (Prisma's advisory lock).
- **Process:** runs as the non-root `node` user, with `tini` as PID 1 so `SIGTERM` reaches Node (graceful shutdown) and orphaned Chromium processes are reaped — no `--init` flag needed from the host. `--disable-dev-shm-usage` means `--ipc=host` is not needed either.
- **Health:** a Docker `HEALTHCHECK` on `GET /api/health`, which deliberately does not touch the database.
- **Measured (Docker Desktop, 2026-10-05):** image 2.85 GB (2.51 GB of it the base, which also carries unused Firefox and WebKit); about 83 MB of memory idle and about 234 MB at the peak of one real conversion. A 512 MB instance looks workable with `p-limit(2)`; verify under load in Phase 6. Slimmed on 2026-10-11 to 1.17 GB (the browser and its libraries 589 MB, production `node_modules` 345 MB); a real conversion in 2.4 s and about 114 MB of memory afterwards (`docs/features/deployment-storage.md`).
- **CI:** `test:docker` in `main.yml` builds the image and runs it against an empty Postgres, launching Chromium inside it, after every merge and nightly (`docs/tests.md` §4.2).
- **On Vercel:** the Container Runtime builds this `Dockerfile` unchanged, as the `api` service in `vercel.json`. `PORT=4000` is set at the host because the runtime's default is 80; the `HEALTHCHECK` is ignored there and stays for other hosts and `test:docker`. Each deployment's image is kept in Vercel's Container Registry and counts toward the Hobby team's 10 GB of deployment storage — the reason the image is kept small and previews are opt-in (`docs/features/deployment-storage.md`).

#### 3.6. The decision (2026-10-10)

- **CPU decided it.** The production image was timed under each candidate's CPU cap: at 0.1 CPU (Render Free, Koyeb Free) every conversion timed out; at 1 vCPU one conversion took about 3 s and two at once about 7 s.
- **Vercel Hobby:** $0 with no card; 2 GB / 1 vCPU; scales to zero after 5 minutes; 4 hours of active CPU and 360 GB-hours of provisioned memory a month; over quota the project pauses rather than bills. The Container Runtime and Services are Beta. Region `fra1`.
- **One origin:** `https://bookrough.vercel.app` — `/api/*` to the container, everything else to the Vite build (`vercel.json`). The `SameSite=Lax` cookie needs no change and CORS is not exercised. `*.vercel.app` is on the Public Suffix List, so a split `api.` / `web.` layout would have broken the cookie.
- **Neon Free:** permanent, no card, Postgres 16 in AWS `eu-central-1`; branch `main` for production, branch `preview` for preview deployments.
- **Deploys:** Vercel's GitHub integration — `main` to production; another branch builds a preview only when it opts in by its exact name in `vercel.json` (`git.deploymentEnabled`), because every deployment stores a backend image (`docs/features/deployment-storage.md`). Phase 6's hardening step makes production wait for `test:e2e` and `test:docker` (Vercel Deployment Checks).
- **Measured in production (2026-10-11):** a real Spotify → Apple Music conversion in 5.3 s.
- **Rejected:** Render Free and Koyeb Free (0.1 CPU), Render Starter ($7 a month), Fly.io and Railway (no ongoing free tier), Netlify (no containers); the free databases of Render (deleted after 30 days) and Supabase (paused after 7 idle days).

### 4. Environments

| Environment | Purpose | Database |
|---|---|---|
| Local development | Day-to-day work | Local `postgres:16` container via `docker-compose.yml` |
| Test | Automated tests, local and in CI | `music_app_test_db`, wiped and migrated per suite |
| Production | The live site | Neon Free, Frankfurt, branch `main` (preview deployments: branch `preview`) |

There is deliberately **no staging environment**. For a project this size it would be overhead without a corresponding benefit; `main` is the release branch and is kept deployable at all times.

### 5. Secrets and configuration

- Secrets live in the hosting provider's environment-variable store. **Never in the repository**, and never in a committed `.env`.
- `.env.example` files are committed with every required key present and every value blank or obviously fake. They are the contract for what must be configured.
- The production `JWT_SECRET` must be independently generated and must never match a development value.
- The Google OAuth client must list the production origin (`https://bookrough.vercel.app`) under **Authorized JavaScript origins** — not under redirect URIs, which this sign-in flow does not use; an origin entered there instead produces `origin_mismatch`. This is a manual step in the Google Cloud Console and is easy to get wrong.
- Production variables are set in Vercel per environment: `DATABASE_URL` and `JWT_SECRET` (secrets, different for Production and Preview), `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, `PORT=4000`, `LOG_LEVEL=info` (lowercase). Never `E2E_GOOGLE_PUBLIC_KEY` or `E2E_SCRAPER_FIXTURES`. The full table is in `docs/features/production-deploy.md` §3.6.
- Rotating a secret is a configuration change at the provider, not a code change or a redeploy of new source.

### 6. The Progressive Web App

The PWA is **in full scope, including offline support**.

#### 6.1. Installability

- `manifest.webmanifest` with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, and `background_color`.
- A complete icon set: 192px and 512px standard icons, a 512px maskable icon for Android, and the `apple-touch-icon` sizes iOS requires.
- iOS-specific meta tags, because Safari does not read everything from the manifest.
- Result: **Share → Add to Home Screen** in Safari produces a full-screen app with no address bar.
- **Built in Step 6.1 as static files:** `frontend/public/manifest.webmanifest` and an icon set rendered once from `icons/icon.svg`, with no service worker. `vite-plugin-pwa` arrives in Step 6.2 and reuses the same manifest file (`docs/features/pwa-installable.md` §3).
- **Install hint:** iOS has no install prompt, and in iOS 26 Safari, Share sits under the ••• menu. iPhone and iPad visitors therefore see a dismissible hint on Welcome and the invite preview — never inside the installed app or in apps' in-app browsers (`docs/features/pwa-installable.md` §5.1).
- **Testing an install before merge** happens on the branch preview: Vercel Authentication switched off for the test and the preview's address under the OAuth client's JavaScript origins. Google's popup sign-in was confirmed to work inside the installed app on iOS 26 (`docs/features/pwa-installable.md` §3.4).

#### 6.2. Service worker

Generated by `vite-plugin-pwa` (Workbox):

- **Precache the app shell** — HTML, JS, CSS, fonts, icons — so a cold launch renders instantly.
- **Runtime-cache** feed responses and album art with a stale-while-revalidate strategy, so returning to a screen is immediate while fresh data loads behind it.
- **Never cache authentication endpoints or mutations.** Only safe `GET` requests are cached.
- **A designed offline fallback page** when a navigation cannot be served, rather than the browser's error screen.

#### 6.3. Offline behaviour

**Offline read is supported. Offline write is not.**

- With no connection, the user can open the app and read a previously loaded feed and their own lists.
- Posting, rating, and bookmarking require connectivity. When offline, these controls show a clear "you're offline" state.
- **Nothing is queued invisibly.** A background sync queue that replays writes when the connection returns is explicitly out of scope: the failure modes — a rating submitted against a post that was since deleted, a duplicate post on flaky reconnect — are not worth the complexity here. The user is told plainly that the action needs a connection.

#### 6.4. Updates

- When a new service worker is installed and waiting, the app prompts the user to reload to get the new version.
- A stale shell must never be allowed to sit indefinitely against a newer API.

#### 6.5. Development hazard

Register the service worker **only in production builds**. A service worker running against the Vite dev server serves stale assets and produces hours of phantom debugging. Any PWA-related change must be verified against a production build (`npm run build && npm run preview`), never against the dev server alone.

### 7. Deployment checklist (Phase 6)

- [x] Provider chosen, with current free-tier terms verified and recorded in this document (§3.6, 2026-10-10).
- [x] Production Postgres provisioned; `DATABASE_URL` set as a secret.
- [x] Prisma migrations run against production — automatic: the container runs `prisma migrate deploy` on start (§3.5).
- [x] `JWT_SECRET` independently generated and set.
- [x] Google OAuth client updated with the production origin (JavaScript origins only, §5).
- [x] Backend deployed from the Playwright-based Docker image; `/api/health` returns 200 over HTTPS.
- [x] Frontend built and deployed on the same origin; production builds default the API base URL to `/api`.
- [x] CORS configured to allow exactly the production origin — not a wildcard (unused in practice: every call is same-origin).
- [x] Auth cookie verified as `HttpOnly`, `Secure`, and `SameSite=Lax` in production (2026-10-11) — possible because the frontend and the API share one origin (§3.6). See `docs/features/google-auth.md` §4.
- [x] Link conversion verified end-to-end in production — the step most likely to fail; it converted in 5.3 s on 2026-10-11.
- [ ] PWA installed on a real iPhone from Safari and launched from the home screen.
- [ ] Offline behaviour verified in airplane mode: feed readable, write actions clearly blocked.
- [ ] Service-worker update prompt verified by deploying a second build.
