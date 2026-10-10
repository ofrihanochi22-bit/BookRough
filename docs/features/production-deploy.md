# Feature: Production deploy

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| **Use cases** | None directly — every UC becomes reachable on a public HTTPS URL (CLAUDE.md §1, §16) |
| **Phase**     | 6 — Step 6.3 of `DEVELOPMENT.md`, shipped first (re-slice, §0)                       |
| **Branch**    | `chore/production-deploy`                                                            |
| **Status**    | ☑ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                   |

---

## 0. How Phase 6 was re-sliced

`DEVELOPMENT.md` ordered Phase 6 as PWA (6.1, 6.2) → deploy (6.3) → hardening (6.4) → README (6.5). The PWA steps' key checks — installing on a real iPhone, airplane mode, "deploy a second build" for the update prompt — need a live HTTPS origin, so neither PWA slice could verify itself inside its own PR. Decided 2026-10-10 (option A): **deploy first**. The step numbers are kept so references stay valid; only the order changes:

| #   | Feature                      | Step | Spec                         |
| --- | ---------------------------- | ---- | ---------------------------- |
| 1   | **Production deploy**        | 6.3  | this document                |
| 2   | PWA: installable             | 6.1  | `pwa-installable.md` (later) |
| 3   | PWA: offline + update prompt | 6.2  | `pwa-offline.md` (later)     |
| 4   | Production hardening         | 6.4  | its own session              |
| 5   | README + deployment notes    | 6.5  | its own session              |

The site is public from feature 1, but **its address is not shared with friends until feature 4 merges** (§9). Feature 4 also switches production deploys to wait for the post-merge checks (§9) and resolves Step 6.4's stale "login, register, password reset" item: only `POST /api/auth/google` exists.

## 1. Goal

BookRough runs on a public HTTPS address — `https://bookrough.vercel.app` if the name is free — with the frontend and the API on that **one origin**, a permanent free Postgres behind it, and real link conversion working in production. The developer can sign in with Google on a phone or a desktop and run the whole golden loop (sign in → onboard → create a community → post a link → rate) against production. Every merge to `main` deploys automatically; every PR gets a preview deployment with its own database branch.

## 2. Scope

**In scope**

- **Host: Vercel, Hobby plan** (free, no card), using two Beta features: the **Container Runtime** runs the existing `backend/Dockerfile` unchanged, and **Services** put the frontend and `/api` on one origin (§3.2). Decided 2026-10-10 against the alternatives in §3.1.
- **Database: Neon, Free plan** (permanent, no card), region `aws-eu-central-1` (Frankfurt): branch `main` for production and branch `preview` for preview deployments.
- **A proof deployment before anything else** (§3.4). If it fails a criterion, the fallback is Google Cloud Run (§3.5) — agreed in advance, no new question.
- `vercel.json` at the repository root: two services and the routing between them (§3.2).
- Frontend: the API base URL defaults to the same-origin `/api` in production builds (§5).
- Deploy trigger: Vercel's GitHub integration — `main` → production, every other branch → a preview (§3.3).
- Configuration the developer sets in the Vercel, Neon and Google Cloud dashboards, listed key by key (§3.6). Claude writes only `.env.example` files with blank values.
- The production checks in §7: health over HTTPS, cookie flags, a real conversion, the four hand-written database objects, cold-start time and quota use.
- Docs: `deployment.md` §3 records the decision, the measurements and the sources with their date (§10).

**Out of scope**

- Rate limiting, security headers, `trust proxy`, and switching production deploys to wait for `test:e2e` / `test:docker` (Vercel Deployment Checks) — all feature 4.
- Who may sign up. The site is open to any Google account, as today; the address is simply not shared yet.
- Manifest, icons, service worker, offline — features 2 and 3. Signing in on a preview (it needs the preview's address added to the Google OAuth client) and passing a preview's Deployment Protection from an installed iPhone app are decided in feature 2's spec, the first feature that needs them.
- A custom domain (about $10 a year; against "free first").
- A keep-warm ping. It would hold the instance up and spend the free memory quota (§6).
- A log drain or any external log store. Vercel keeps Hobby runtime logs for one hour; that is accepted, and it also means request logs go nowhere persistent.
- Backups beyond Neon's built-in restore window.
- Moving data from the local development database. Production starts empty.

## 3. Infrastructure and configuration

No schema change and no migration. `backend/prisma/schema.prisma` is untouched.

### 3.1 Hosting decision (verified 2026-10-10)

The backend runs headless Chromium, so the decision turned on **CPU**, not memory. The production image was run locally under each candidate's CPU cap (512 MB, Docker Desktop) and timed on real squigly.link conversions:

| CPU cap | One conversion | Two at once (`p-limit(2)`) |
| ------- | -------------- | -------------------------- |
| 1.0     | 2.9–3.6 s      | ~6.8 s                     |
| 0.5     | 4.6–5.5 s      | ~11.8 s (at the ceiling)   |
| 0.25    | —              | timeout                    |
| 0.1     | timeout, 3 / 3 | timeout                    |

A third test link answered "no answer" at every level — a property of that link, not of the host.

| Candidate                              | Terms on 2026-10-10                                                                                                                                                                                                                                                     | Verdict                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Vercel Hobby + Container Runtime**   | $0, no card; 2 GB / 1 vCPU; 300 s max duration; scales to zero after 5 min; 4 h active CPU, 360 GB-h provisioned memory, 1 M invocations a month; over quota the project **pauses** rather than bills; non-commercial use only; Container Runtime and Services are Beta | **Chosen** — the only $0, no-card option with 1 vCPU               |
| Google Cloud Run + Neon                | Ongoing monthly free allowance (180,000 vCPU-s, 360,000 GiB-s); needs a billing account; image storage above 0.5 GB ≈ $0.10/GB-month                                                                                                                                    | **Fallback** (§3.5) — GA, but a card on file and overage bills     |
| Render Starter                         | $7/month, 0.5 CPU, 512 MB, never sleeps                                                                                                                                                                                                                                 | Rejected — paid, and `p-limit` would have to drop to 1             |
| Render Free / Koyeb Free               | $0; 512 MB / 0.1 CPU; sleep after 15 min (Render, ~1 min wake) or 1 h (Koyeb)                                                                                                                                                                                           | Rejected — every conversion timed out at 0.1 CPU                   |
| Fly.io / Railway                       | No ongoing free tier (Fly: a 2-hour / 7-day trial; Railway: $1 credit a month after the trial)                                                                                                                                                                          | Rejected — not free                                                |
| Netlify Functions                      | 1 GB, 30 s; no containers — Express rewritten as a function with a separate Chromium package                                                                                                                                                                            | Rejected — rewrite, new dependencies, Dockerfile abandoned         |
| Databases: Render Free / Supabase Free | Render's free Postgres is deleted after 30 days; Supabase's free project pauses after 7 days idle                                                                                                                                                                       | Rejected — Neon Free is permanent and never deleted for inactivity |

Sources, read 2026-10-10: Vercel [Container Runtime](https://vercel.com/docs/functions/container-images), [Functions limits](https://vercel.com/docs/functions/limitations), [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), [Container Registry pricing](https://vercel.com/docs/container-registry/limits-and-pricing), [Services](https://vercel.com/docs/services), [Services routing](https://vercel.com/docs/services/routing), [Deployment Protection](https://vercel.com/docs/deployment-protection), [Deployment Checks](https://vercel.com/docs/deployment-checks); [Neon pricing](https://neon.com/pricing); [Cloud Run pricing](https://cloud.google.com/run/pricing), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing); [Render free tier](https://render.com/docs/free), [Render instance types](https://render.com/docs/compute-plans); [Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero); [Fly.io pricing](https://docs.fly.io/about/pricing); [Railway free trial](https://docs.railway.com/reference/pricing/free-trial); [Netlify credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/). Supabase's 7-day pause is from a third-party summary and must be re-read on Supabase's own page if it ever matters again.

### 3.2 Topology — one origin

```
https://bookrough.vercel.app
├── /api/*  → service "api"  — backend/Dockerfile, run by the Container Runtime (receives the path unchanged: /api/…)
└── /*      → service "web"  — frontend/, Vite static build, unknown paths fall back to /index.html
                                        │
                                        ▼
                         Neon Postgres, Frankfurt (branch main | preview)
```

`vercel.json` (repository root), shape:

```json
{
  "services": {
    "api": { "root": "backend/", "entrypoint": "Dockerfile" },
    "web": {
      "root": "frontend/",
      "framework": "vite",
      "buildCommand": "npm run build",
      "outputDirectory": "dist",
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

The exact keys are confirmed by the proof deployment (§3.4); any difference goes into §9.

Consequences:

- **The session cookie needs no change.** Frontend and API share one origin, so `SameSite=Lax` holds and the cookie is sent on every API call (`google-auth.md` §4). `Secure` is already on: the image bakes in `NODE_ENV=production`.
- **CORS is no longer exercised** in production — every call is same-origin. `CORS_ORIGIN` is still required by the env schema and is set to the production origin. On a preview the header names the production origin, which the browser ignores for a same-origin request.
- `*.vercel.app` is on the Public Suffix List, so a split `web.` / `api.` layout would have been two sites and would have broken the `Lax` cookie. The single origin is what avoids it.
- **The backend image is untouched**: the same `Dockerfile`, `tini`, non-root user, and migrations on start. The Container Runtime listens on `PORT`, which our server already reads. Docker's `HEALTHCHECK` is ignored by Vercel and stays for other hosts and for `test:docker`.
- **The database connection** is Neon's direct (non-pooled) connection string with `sslmode=require`. With a handful of instances at most, Prisma's default pool fits Neon's connection limit, and `prisma migrate deploy` works on the same URL. No `directUrl`, no schema change.
- **Region:** Vercel Functions `fra1` and Neon `aws-eu-central-1`, both Frankfurt, the closest to Israel. One region is all Hobby allows.

### 3.3 Deploy trigger

Vercel's GitHub integration (developer's choice, option A): a push to `main` deploys production; a push to any other branch builds a **preview deployment** at its own address. Previews use the Neon `preview` branch and a separate `JWT_SECRET`, so they never touch production data or sessions. Vercel's default Standard Protection keeps previews behind Vercel sign-in.

Production therefore updates right after a merge, before `main.yml`'s E2E and Docker jobs finish; the PR checks that gate the merge have already passed, and a red post-merge run is fixed before anything else (CLAUDE.md §10). **Feature 4 switches on Vercel Deployment Checks** so production waits for `test:e2e` and `test:docker` (developer's request, 2026-10-10). If Deployment Checks prove unavailable on Hobby, feature 4 uses a deploy job at the end of `main.yml` with a `VERCEL_TOKEN` secret instead.

### 3.4 Proof deployment — the first task of Stage 2

Both Beta features and one unknown are tested before the rest is built. The developer creates the accounts and the project (§3.6); Claude pushes the branch; the branch's **preview deployment** is the proof. M3 needs a Google sign-in on the preview, so the branch's stable alias (`bookrough-git-chore-production-deploy-<scope>.vercel.app`, shown in the deployment's Domains) is added to the OAuth client's JavaScript origins for the proof and removed after the merge. The developer runs M2–M5 in a desktop browser already signed in to Vercel, since previews sit behind Vercel's Standard Protection.

| #   | Criterion                                                  | Pass                                                      |
| --- | ---------------------------------------------------------- | --------------------------------------------------------- |
| M1  | The image builds on Vercel (compressed layers ≤ 2 GB each) | The build log ends green                                  |
| M2  | `GET /api/health` over HTTPS                               | `200` with the success envelope                           |
| M3  | A real conversion: one post with a Spotify track link      | `converted`, under 10 s (CLAUDE.md §7 p95)                |
| M4  | Container Registry storage on Hobby                        | The usage page shows no charge and no block for the image |
| M5  | Cold start: first `/api/auth/me` after ≥ 6 minutes idle    | Measured and recorded; under the client's 15 s timeout    |

If **M1–M4** fail, the fallback (§3.5) is used. If **M5** is over 15 s, the fix is to move `prisma migrate deploy` out of the container's start (a `command` override plus a migration step at deploy time) before anything else; the choice is recorded in §9.

### 3.5 Fallback — Google Cloud Run

Used only if §3.4 fails. The same image on Cloud Run (1 vCPU, 1 GiB, scale to zero, `europe-west1` or the nearest free-tier region) and Neon as above, in the Google Cloud project that already holds the OAuth client. Same origin: the backend container would also serve the built frontend, or Firebase Hosting would rewrite `/api` to it. The spec is amended before that path is built, and the developer adds a billing account and a budget alert.

### 3.6 What the developer sets up (Claude never sees a value)

**Neon** (neon.com, sign in with GitHub or Google):

1. Create a project `bookrough`, Postgres 16, region **AWS Europe Central 1 (Frankfurt)**.
2. Keep the default branch `main` (production). Create a branch **`preview`** from it.
3. From **Connect**, copy each branch's **direct** connection string (not the pooled one) with `sslmode=require`. Paste them only into Vercel (below).

**Vercel** (vercel.com, sign up with GitHub, Hobby):

1. **Add New → Project → Import** `ofrihanochi22-bit/BookRough`. This installs the Vercel GitHub app on the repository. Project name `bookrough`.
2. **Settings → Functions → Region:** `fra1`.
3. **Settings → Environment Variables** — each key scoped as shown:

| Key                     | Production                                        | Preview                         | Notes                                 |
| ----------------------- | ------------------------------------------------- | ------------------------------- | ------------------------------------- |
| `DATABASE_URL`          | Neon `main` direct string                         | Neon `preview` direct string    | Secret                                |
| `JWT_SECRET`            | a new 64-byte value                               | a _different_ new 64-byte value | Secret; never a development value     |
| `GOOGLE_CLIENT_ID`      | the existing Web client ID                        | same                            | Public by design                      |
| `VITE_GOOGLE_CLIENT_ID` | same as above                                     | same                            | Embedded in the frontend build        |
| `CORS_ORIGIN`           | `https://bookrough.vercel.app` (the real address) | same                            | Bare origin, no trailing slash        |
| `PORT`                  | `4000`                                            | `4000`                          | The Container Runtime's default is 80 |
| `LOG_LEVEL`             | `info`                                            | `info`                          |                                       |

Generate each `JWT_SECRET` on your own machine and paste it straight into Vercel:
`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
`E2E_GOOGLE_PUBLIC_KEY` and `E2E_SCRAPER_FIXTURES` are **never** set; the API refuses to start with them outside `NODE_ENV=test`.

**Google Cloud Console** → APIs & Services → Credentials → the Web client → **Authorized JavaScript origins**: add `https://bookrough.vercel.app`. No redirect URI is needed: sign-in uses the Google Identity Services popup, which returns an ID token to the page (this corrects `deployment.md` §5 and §7, which said "and redirect URIs").

**After the first production deploy**, in Neon's SQL editor on branch `main`, after signing in once: make yourself admin (CLAUDE.md §17) with
`UPDATE users SET role = 'ADMIN' WHERE display_name = '<your display name>';` — then run the check in §7 (P6).

## 4. API

No endpoint is added or changed. Every existing route is served under `https://<origin>/api/…` exactly as locally.

Responses that can now come from the platform rather than from Express:

- **`502` / `504`** from Vercel — the container failed to start (for example, a failed migration) or did not answer. The client's existing "Can't reach the server" toast and inline error states cover them.
- **Paused project** — if the Hobby quota is exhausted, Vercel serves its own error page for every path until the month resets. The installed app shows the same network-error states. No charge is possible.
- **`401`** on previews for anyone not signed in to Vercel — Standard Protection, not the API.

## 5. Screens & components

No screen changes. One frontend module changes:

- **`frontend/src/api/client.ts`** — `baseURL` is `VITE_API_BASE_URL` when set; otherwise `/api` in a production build (`import.meta.env.PROD`) and `http://localhost:4000/api` in development. A production build can then never call `localhost` by accident, and Vercel needs no `VITE_API_BASE_URL`. `frontend/.env.example` says so.

States, unchanged in code but now exercised for real:

- **Loading:** a cold start (§6) shows the existing skeletons and spinners for a few seconds longer.
- **Error / offline:** network failures, `502`/`504` and a paused project all land on the existing "Can't reach the server. Check your connection and try again." toast and the screens' inline error states with Try again.
- **Posting:** unchanged — the spinner, the 12 s ceiling, and "other services unavailable" if conversion is abandoned (CLAUDE.md §7).

## 6. Edge cases & failure modes

- **Cold start.** After 5 minutes without traffic the instance scales to zero; the next request starts the container (`tini` → `prisma migrate deploy` → Node) and Neon resumes from its own 5-minute suspend. Measured as M5. A first request slower than the client's 15 s timeout would show the error toast once — the reason M5 has a fix ready (§3.4).
- **A post during a cold start.** Posting usually follows a page load that has already woken the instance. If not, start-up time plus the 12 s ceiling could pass the 15 s client timeout while the post still saves; a retry would then create a second post. Covered by M5: if the cold start is above ~3 s, the fix in §3.4 applies.
- **Two instances.** Under concurrent load Vercel may run two containers; `p-limit(2)` is per instance, so up to four Chromiums at once across instances, each with its own 2 GB. Acceptable; feature 4 confirms the cap under a burst.
- **Concurrent starts** run `prisma migrate deploy` at the same time; Prisma's advisory lock serialises them (`backend-docker.md`).
- **A failed migration** stops the container before it serves; the deployment shows `502`, and the previous production deployment is restored from the Vercel dashboard (Instant Rollback; its Hobby limits are checked during the proof deployment).
- **Quota exhaustion** (360 GB-h of provisioned memory ≈ 180 instance-hours a month at 2 GB): the project pauses until the month resets — down, never billed. Checked on the usage page a week after launch (P10). If it trends high: lower the instance memory if Hobby allows, else the fallback.
- **squigly.link changes or is down:** unchanged — the post saves as `conversion_pending` (CLAUDE.md §7).
- **Neon free compute quota** (100 CU-hours a month): at 0.25 CU awake only while queried, about 400 awake hours — far above use. If exhausted, compute suspends until the next month; the API answers `500`s with the standard envelope.
- **Preview deployments of docs-only branches** still build; harmless.
- **The Beta features change terms.** The Dockerfile remains the deployment unit, so moving to the fallback is configuration, not code (CLAUDE.md §16).

## 7. Test scenarios

**Unit — frontend (Vitest)**

- ✅ `api/client`: uses `VITE_API_BASE_URL` when it is set.
- ✅ `api/client`: defaults to `/api` in a production build when it is not set.
- ✅ `api/client`: defaults to `http://localhost:4000/api` in development when it is not set.
- ✅ `vercel.json` contract: `/api/(.*)` routes to the `api` service and comes **before** the catch-all; the catch-all routes to `web`; `api` builds from `backend/`'s `Dockerfile`; `web` falls back to `/index.html`. (Nothing else can catch a reordered rewrite before production: E2E does not run on Vercel.)
- ❌ `vercel.json` contract: no build keys (`buildCommand`, `framework`, `outputDirectory`, `functions`) at the top level, where services mode rejects them.

**Unit — backend (Vitest)**

- ✅ `config/env`: accepts an `https` production origin for `CORS_ORIGIN`.
- ❌ `config/env`: rejects a `CORS_ORIGIN` with a trailing path (`https://bookrough.vercel.app/app`).

**Integration (Supertest)** — none new: no endpoint changes. The existing suite stays green.

**E2E (Playwright)** — none new. The existing 41 runs (+3 skipped) stay green; `test:docker` still proves the image starts, migrates and shuts down cleanly.

**Manual — proof deployment (Claude runs what it can; values stay the developer's)** — M1–M5 in §3.4.

**Manual — production smoke test (the developer, on the production address)**

- P1. `https://bookrough.vercel.app/api/health` → `200`; the browser shows a valid certificate.
- P2. On a desktop browser and on the iPhone in Safari: **Continue with Google** → onboarding → dashboard.
- P3. DevTools → Application → Cookies: `token` is `HttpOnly`, `Secure`, `SameSite=Lax`, on the production host.
- P4. Create a community; post a Spotify track link → the post shows links for the other services; note the spinner time.
- P5. Rate the post from a second Google account that joined through the invite link (also checks an invite link opened from another device).
- P6. In Neon's SQL editor on `main`: the four hand-written objects exist — `community_members_one_owner`, `ratings_score_range`, `friends_one_per_pair`, `friends_not_self` — and `_prisma_migrations` lists every migration as applied. Then make yourself admin and open the Admin screen.
- P7. Reload a deep link (`/communities/<id>`) → the page loads, not a Vercel 404.
- P8. A preview deployment of this branch reads the `preview` database: a community created there does not appear in production.
- P9. Sign out → the cookie is cleared; protected screens redirect to Welcome.
- P10. A week after launch: Vercel usage — active CPU, provisioned memory, invocations — and Neon usage, recorded in `DEVELOPMENT.md`.

## 8. Open questions

None. Two items are decided in later specs on purpose: signing in on previews and passing their protection from an installed iPhone app (feature 2), and Deployment Checks, rate limiting and who may sign up (feature 4).

## 9. Decisions log

| Date       | Decision                                                                                                        | Reason                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-10 | Phase 6 re-sliced: deploy first, then PWA installable, PWA offline, hardening, README (option A)                | The PWA slices' manual checks need a live HTTPS origin; rate limiting needs the host's proxy known                                 |
| 2026-10-10 | Vercel Hobby (Container Runtime + Services) and Neon Free, with Cloud Run as the agreed fallback (option A)     | Developer's priorities: free first, then efficiency. Only $0, no-card option with 1 vCPU; 0.1-CPU tiers timed out every conversion |
| 2026-10-10 | Deploys through Vercel's GitHub integration now; Deployment Checks on `test:e2e` / `test:docker` from feature 4 | Developer: the fast path while there are no users, the gated path once friends use it                                              |
| 2026-10-10 | Production is public from day one; the address is shared only after feature 4 merges (option A)                 | Vercel Authentication would block the installed iPhone app in features 2–3; cost cannot exceed $0                                  |
| 2026-10-10 | `*.vercel.app` address, no custom domain                                                                        | Free first                                                                                                                         |
| 2026-10-10 | One origin through Services; Frankfurt for both Vercel and Neon; Neon direct connection, no `directUrl`         | Keeps `SameSite=Lax` and the cookie unchanged; nearest region; no schema change                                                    |
| 2026-10-10 | No keep-warm ping, no log drain, production starts empty                                                        | Quota; data minimisation; nothing worth migrating                                                                                  |
| 2026-10-10 | Google OAuth needs only the JavaScript origin, not a redirect URI                                               | The Identity Services popup returns the ID token to the page                                                                       |

## 10. Doc updates (same PR)

- `docs/deployment.md` + `.docx`: §3 — the decision, the measurement table, the candidates and the dated sources; §3.5 — the image on Vercel's Container Runtime; §4 — the production row (Vercel + Neon) and preview deployments; §5 — the variable list, no redirect URI; §7 — the checklist ticked as verified.
- `docs/tech stack.md` + `.docx` §5: **Vercel** and **Neon** (what, why, what breaks without them, account and cost) (CLAUDE.md §18).
- `docs/development strategy.md` + `.docx`: Phase 6 in its new order.
- `CLAUDE.md`: §2 Infra and §16 — the provider is chosen; §3 — `vercel.json`.
- `DEVELOPMENT.md`: the Phase 6 re-slice note and Step 6.3 (§13); Step 6.4's stale item flagged.
- `docs/features/invite-friends.md`: Merged ticked.
- `frontend/.env.example` and `backend/.env.example`: the production notes, blank values.
