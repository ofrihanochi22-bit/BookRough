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

### 3. Provider selection — deliberately deferred to Phase 6

**No hosting provider has been chosen, and one will not be chosen until Phase 6 is reached.**

This is a deliberate decision, not an oversight. Free-tier terms change frequently — memory allowances, idle-spin-down behaviour, and especially the lifetime of free managed databases. Committing now to terms that may not hold months from now would mean planning against stale facts. The comparison below records the shape of the decision; the actual terms must be re-verified against each provider's current pricing page at the moment the decision is made.

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

#### 3.4. Rule until Phase 6

**Keep the code provider-agnostic.** Specifically:

- All configuration through environment variables. No hardcoded hostnames, regions, or connection strings.
- No provider-specific SDKs, no proprietary build plugins, no vendor lock-in in application code.
- The backend `Dockerfile` is the deployment unit and must stay runnable on any container host.
- Database access only through Prisma, so the Postgres instance can be moved by changing `DATABASE_URL`.

Written this way, the Phase 6 decision is a configuration change, not a rewrite.

### 4. Environments

| Environment | Purpose | Database |
|---|---|---|
| Local development | Day-to-day work | Local `postgres:16` container via `docker-compose.yml` |
| Test | Automated tests, local and in CI | `music_app_test_db`, wiped and migrated per suite |
| Production | The live site | Managed Postgres at the chosen provider |

There is deliberately **no staging environment**. For a project this size it would be overhead without a corresponding benefit; `main` is the release branch and is kept deployable at all times.

### 5. Secrets and configuration

- Secrets live in the hosting provider's environment-variable store. **Never in the repository**, and never in a committed `.env`.
- `.env.example` files are committed with every required key present and every value blank or obviously fake. They are the contract for what must be configured.
- The production `JWT_SECRET` must be independently generated and must never match a development value.
- The Google OAuth client must list the production origin in its authorised JavaScript origins and redirect URIs; this is a manual step in the Google Cloud Console at deploy time and is easy to forget.
- Rotating a secret is a configuration change at the provider, not a code change or a redeploy of new source.

### 6. The Progressive Web App

The PWA is **in full scope, including offline support**.

#### 6.1. Installability

- `manifest.webmanifest` with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, and `background_color`.
- A complete icon set: 192px and 512px standard icons, a 512px maskable icon for Android, and the `apple-touch-icon` sizes iOS requires.
- iOS-specific meta tags, because Safari does not read everything from the manifest.
- Result: **Share → Add to Home Screen** in Safari produces a full-screen app with no address bar.

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

- [ ] Provider chosen, with current free-tier terms verified and recorded in this document.
- [ ] Production Postgres provisioned; `DATABASE_URL` set as a secret.
- [ ] Prisma migrations run against production.
- [ ] `JWT_SECRET` independently generated and set.
- [ ] Google OAuth client updated with the production origin and redirect URI.
- [ ] Backend deployed from the Playwright-based Docker image; `/api/health` returns 200 over HTTPS.
- [ ] Frontend built with the production `VITE_API_BASE_URL` and deployed.
- [ ] CORS configured to allow exactly the production frontend origin — not a wildcard.
- [ ] Auth cookie verified as `HttpOnly`, `Secure`, and `SameSite` appropriate to the final origin layout.
- [ ] Link conversion verified end-to-end in production — this is the step most likely to fail, because Chromium's memory footprint on a small instance is not reproducible locally.
- [ ] PWA installed on a real iPhone from Safari and launched from the home screen.
- [ ] Offline behaviour verified in airplane mode: feed readable, write actions clearly blocked.
- [ ] Service-worker update prompt verified by deploying a second build.
