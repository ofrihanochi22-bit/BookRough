# Feature: Production hardening

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use cases** | No new UC. Protects UC-1/2 (sign-in), UC-11 (posting), UC-20 (direct recommendations), UC-6 (friend requests), UC-9 (communities, invitations) |
| **Phase**     | 6 — Step 6.4 (DEVELOPMENT.md)                                                                                                                  |
| **Branch**    | `chore/production-hardening`                                                                                                                   |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                                                                             |

---

## 1. Goal

After this ships, a casual abuser can't knock over the public deployment or spend its free quotas, and a bad deploy can't reach production: it has to pass the full E2E and Docker suites first. The Vercel registry also stops growing with every merge, no secret sits in the repository or can enter it unnoticed, and no log line carries PII. **The address `https://bookrough.vercel.app` is shared with friends only after this merges** (production-deploy.md §0).

The task list in DEVELOPMENT.md Step 6.4 predates Google-only sign-in. This spec replaces it.

## 2. Scope

**In scope**

1. Rate limiting with `express-rate-limit`, using in-memory stores and four tiers (§3.1).
2. `trust proxy`, set from a new `TRUST_PROXY_HOPS` environment variable (§3.2).
3. A baseline set of security headers on the pages (`vercel.json`) and on the API (our own middleware) (§3.3).
4. Confirming that the `p-limit(2)` scraper cap and the 12-second ceiling hold under a burst (§3.4).
5. Auditing the logs for PII and secrets, and fixing what turns up (§3.5).
6. A secret scan of the full git history now, and a `secrets` CI job from now on (§3.6).
7. Making production deploys wait for `test:e2e` and `test:docker` through Vercel Deployment Checks (§3.7).
8. Capping Vercel storage: a `main.yml` job keeps the 4 newest registry images, and the developer sets a short Preview retention (§3.8).
9. Confirming that nightly E2E failures are visible (§3.9).

**Out of scope**

- **Restricting sign-up.** Any Google account may still create an account, as today (decided 2026-11-07). Invite-only sign-up, admin approval and allowlists are not built. An email allowlist is impossible anyway: no email is stored (CLAUDE.md §5).
- **Shared rate-limit storage** (Postgres, Redis/Upstash). Counters live in each instance's memory. They reset on a cold start and are counted per instance (§6).
- **A Content-Security-Policy**, `helmet`, and `Cross-Origin-Opener-Policy`. A CSP needs testing on a live origin and an iPhone, and a wrong one breaks Google sign-in for everyone. A later step may add one in report-only mode first.
- **`Cache-Control` changes on API responses.** They would interact with Step 6.2's service-worker caching (PR #40, not touched here).
- **Rewriting git history.** If a real secret is found, it is rotated by the developer, not scrubbed (§3.6).
- A log drain or any persistent log store. Logs stay in Vercel's runtime log view.
- Lowering the Chromium memory or concurrency cap. It is only measured here.

## 3. Design

### 3.1 Rate limiting

`express-rate-limit`, pinned to an exact version (a new dependency, approved 2026-11-07, recorded in `docs/tech stack.md` §5 and its `.docx`). It uses the library's in-memory store. The routers are module-level, so the four limiters are too, each with its own `MemoryStore`. Two test-only hooks, `setRateLimitsEnabled` and `resetRateLimits`, which throw outside `NODE_ENV=test`, let the rate-limit suites switch the limits on and start each test from empty counters. Every other suite runs with them off.

| Tier | Name         | Endpoints                                                                                                                                              | Key      | Limit                             | 429 message                                                  |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------- | ------------------------------------------------------------ |
| 1    | `conversion` | `POST /api/communities/:id/posts`, `POST /api/recommendations`, `POST /api/posts/:postId/conversion`                                                   | `userId` | 10 per 10 min, one shared counter | "You're sharing links too fast. Try again in a few minutes." |
| 2    | `signIn`     | `POST /api/auth/google`, `POST /api/users/me/google-picture`                                                                                           | IP       | 10 per 15 min, shared             | "Too many sign-in attempts. Try again in a few minutes."     |
| 3    | `outreach`   | `POST /api/friends/requests`, `POST /api/communities/:id/invitations`, `POST /api/communities`, `PUT /api/users/me/avatar` (added by avatar-upload.md) | `userId` | 30 per hour, shared               | "You've sent a lot of requests. Try again later."            |
| 4    | `global`     | every `/api` route except `/api/health`                                                                                                                | IP       | 300 per minute                    | "Too many requests. Slow down and try again shortly."        |

- **Placement.** Tier 4 is mounted on `apiRouter` before every route. Tiers 1 and 3 sit **after `requireAuth`**, so an unauthenticated request gets `401` and never touches a user's counter. Tier 2 comes before the token is checked. Routers still only define routes: each limiter is a middleware in the route list, like `requireAuth`.
- **IPv6** keys use the library's default subnet grouping.
- **Every request counts**, including ones later refused with `4xx`. A refused link can still launch Chromium (squigly's "could not be found"), and counting only successes would let a script retry for free.
- **The response** is `429` in the standard error shape, `{ "status": "error", "code": 429, "message": … }`. It's written through the library's `handler` option calling `next(new AppError(message, 429))`, so the central error handler stays the only error writer (CLAUDE.md §4). The headers are `RateLimit` (draft-8 combined form) and `Retry-After`. The legacy `X-RateLimit-*` headers are off.
- **Logging.** A tripped limiter logs one `warn` with the tier name and `userId` if known. It never logs the IP or the key.
- **Frontend.** The axios interceptor already toasts the backend's message on any `4xx`. The two posting forms (community post, direct recommendation) must keep the draft and re-enable Submit on a `429`, as they already do for other errors. Stage 2 confirms this and fixes it if not. No new screen.
- **Tests and E2E.** A `RATE_LIMITS_DISABLED=true` environment variable turns all four tiers off. The E2E suite signs in dozens of times from one IP, so its workflow sets the variable. **The env schema allows it only under `NODE_ENV=test`,** the same rule as the E2E stand-ins, so a host that forgets `NODE_ENV` is refused too. The server fails to start, and the limits can never be switched off in production.

### 3.2 `trust proxy`

Behind Vercel's proxy, `req.ip` is the proxy's address unless Express trusts it. That would put every user in one tier-2 and tier-4 bucket.

- A new env var, `TRUST_PROXY_HOPS`, is a non-negative integer, default `0`. Locally and in CI it stays `0`. The developer sets it to **`1`** in Vercel's Production and Preview environments. It isn't a secret. Claude adds it to `backend/.env.example` with a comment.
- `app.set('trust proxy', env.TRUST_PROXY_HOPS)`. With one hop, Express takes the address the proxy appended, and anything a client puts at the front of `X-Forwarded-For` is ignored.
- This keeps the code provider-agnostic (CLAUDE.md §16). Cloud Run would also use `1`.
- `app.disable('x-powered-by')` lands in the same change.

### 3.3 Security headers (no CSP)

| Header                   | Value                                                          |
| ------------------------ | -------------------------------------------------------------- |
| `X-Content-Type-Options` | `nosniff`                                                      |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`                              |
| `X-Frame-Options`        | `DENY`                                                         |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |

- **Pages:** a `headers` block in `vercel.json`'s `web` service, covering every path. Vercel serves the HTML, not Express, and with `services` each service owns its own `headers` rules (Vercel's Services routing documentation, read 2026-11-07).
- **API:** a small `securityHeaders` middleware in `backend/src/middleware/`, registered first in `createApp()`.
- **Not added:** `Strict-Transport-Security` (Vercel sends it on its domains; checked in P4) and `Cross-Origin-Opener-Policy` (Google's sign-in popup is sensitive to it).
- `strict-origin-when-cross-origin` sends only the origin to album-art and Google hosts, never a path. So an `/invite/<token>` path can't leak through `Referer`.

### 3.4 `p-limit(2)` under a burst

The code exists (`linkScraper.service.ts`). This step proves it:

- **Automated:** a unit test fires 5 simultaneous `convertLink` calls against a mocked browser that holds each page. It asserts that at most 2 scrapes ever run at once, that the third starts only when a slot frees up, and that every call resolves within `CONVERSION_CEILING_MS` (queued ones as `timeout`, without launching a browser). Existing tests are extended rather than duplicated.
- **Manual (Claude, local Docker image):** 5 real posts submitted at once by the same user. That's within tier 1. Recorded: each response time (every one ≤ 12 s plus overhead), the peak container memory from `docker stats`, and that the posts saved (converted or `conversion_pending`). The numbers go into `docs/deployment.md` §3.5 and its `.docx`.

### 3.5 Log audit

Claude reads every `log.*` call in `backend/src` (59 today), the request serializer (`redactPath.ts`), and the error handler. Each is checked against CLAUDE.md §4/§5: no email, token, cookie, Google ID token, display name, search text, invite token or IP address.

- **Known risk to check:** `errorHandler` logs a raw `err` for unhandled errors. A Prisma error message can carry query values. If the audit confirms it, unhandled errors are logged through an error serializer that keeps `name`, `code` and the stack frames, and drops a message that isn't ours.
- Every finding is fixed in this PR, and each fix gets a regression test asserting what the log line does **not** contain.
- The audit result, including "nothing found" for each area, is written to §9 of this spec.

### 3.6 Secrets: history scan and a CI job

- **Once, now:** `gitleaks` (pinned image `ghcr.io/gitleaks/gitleaks:<exact tag>`, run through Docker; nothing is installed in the repo) runs over the full history of every branch on the remote. Findings are reported with `--redact`, so no value reaches the terminal or the chat.
- **From now on:** a `secrets` job in `ci.yml` runs on every PR and on `main` (as `checks / secrets`), with `fetch-depth: 0`. It runs the same pinned `gitleaks` image over the full history and fails on any finding. A `.gitleaksignore` at the repo root lists every reviewed false positive by its exact gitleaks fingerprint (commit, file, rule, line), never by path or rule. A new finding fails CI and is reviewed before anything is added.
- **Branch protection:** making `checks / secrets` required is a repository setting. Claude asks the developer before changing it (CLAUDE.md §11). CLAUDE.md §10's "four jobs" becomes five.
- **A real finding** means the developer rotates that secret (Vercel env, Google Console, Neon). It counts as exposed because it reached GitHub. History is not rewritten. Claude then adds a narrow allowlist entry for the now-dead value's fingerprint, so CI goes green.

### 3.7 Production waits for `test:e2e` and `test:docker`

Decided 2026-10-10 (production-deploy.md §3.3):

- **The developer** opens Vercel → project `bookrough` → Settings → Deployment Checks and adds `test:e2e` and `test:docker` (the GitHub check names from `main.yml`). A production deployment is then built after a merge but promoted only once both pass.
- **Claude** confirms in Stage 2 that the two jobs report under stable check names, renaming nothing users depend on, and documents the check in `docs/deployment.md` §3.6 and its `.docx`.
- **If Hobby doesn't offer Deployment Checks:** fall back to `main` → `deploymentEnabled: false` in `vercel.json`, plus a `deploy` job at the end of `main.yml` (`needs: [test-e2e, test-docker]`) that deploys with `VERCEL_TOKEN`. That fallback is a spec amendment recorded in §9 before it's built.
- `main.yml`'s E2E runs on scraper fixtures, so a squigly.link outage can't block a deploy; only our own regressions can.

### 3.8 Registry pruning

Decided 2026-11-02 (deployment-storage.md §1.2); the gate (Images Storage seen to fall) passed on 2026-11-03.

- **A `prune-images` job in `main.yml`** runs on `push` to `main` and on `workflow_dispatch`, not on the nightly schedule, with `needs: [test-e2e, test-docker]`. By then the newest image is the one being promoted. It runs `backend/src/ops/pruneImages.ts` with Node's own type stripping, calling Vercel's documented REST endpoints (`GET` and `DELETE /v1/vcr/repository/api/images`) with `fetch` and `VERCEL_TOKEN`. No Vercel CLI and no package; the decisions sit in a pure, unit-tested `planPrune`.
- **Dry run until the developer says so.** Every run prints what it keeps and what it would delete. It deletes only when the repository variable `PRUNE_IMAGES` is `delete`, which the developer sets after reading the first run's plan. The team slug comes from the repository variable `VERCEL_TEAM`; neither variable is a secret.
- **Only tagged images are candidates.** An untagged entry can be a platform manifest that belongs to a kept image, so untagged entries are never touched.
- **Logic:** list the images in the project's `api` repository and sort them newest first. Keep the 4 newest and delete the rest with `image rm --yes`. Hard guards:
  - delete nothing if the list has 4 or fewer entries or can't be parsed;
  - never delete the image tagged with the current commit SHA;
  - never delete more than 10 in one run;
  - print what was kept and what was deleted.
- **A missing `VERCEL_TOKEN` fails the job** (red `main`, fixed first; CLAUDE.md §10) rather than skipping silently.
- **The developer** creates a Vercel access token scoped to the team, with an expiry, and stores it as the repository secret `VERCEL_TOKEN`. Its renewal date goes in `HANDOFF.md` §5. The developer also sets Preview deployment retention to 7 days (Settings → Build and Deployment).
- **Ceiling:** about 1.6 GB of Images Storage and about 4.8 GB of Function Storage. The pre-merge meter check (CLAUDE.md §16) stays.

### 3.9 Nightly E2E failures are visible

GitHub notifies the user who last edited a workflow's `schedule` about scheduled-run failures. The developer confirms that GitHub → Settings → Notifications → Actions sends failed-workflow notifications to an address they read. No code.

## 4. Data model changes

None.

## 5. API

No new endpoints. Every endpoint listed in §3.1 gains one possible error:

- **`429`** — the tier's limit is reached; the message is from §3.1; `Retry-After` is set.

Every `/api` response gains the §3.3 headers and loses `X-Powered-By`.

**New environment variables** (`backend/.env.example`, `backend/src/config/env.ts`):

| Name                   | Type / default   | Production                            |
| ---------------------- | ---------------- | ------------------------------------- |
| `TRUST_PROXY_HOPS`     | integer ≥ 0, `0` | `1` (developer sets in Vercel)        |
| `RATE_LIMITS_DISABLED` | boolean, `false` | must be unset; startup refuses `true` |

## 6. Screens & components

No new screens. Behaviour checked on:

- **Community Feed composer, Recommendations composer:** a `429` shows the toast, keeps the pasted link and text, and re-enables Submit.
- **Welcome:** a `429` from sign-in shows the toast. The Google button stays usable.

## 7. Edge cases & failure modes

- **A cold start resets the counters.** Accepted: the instance scales to zero after 5 idle minutes, and an abuser would have to wait it out between bursts.
- **Two instances double the effective limit.** Accepted; it's the same trade-off as `p-limit(2)` (production-deploy.md §6).
- **Friends on one Wi-Fi** share an IP for tiers 2 and 4. Ten sign-ins in 15 minutes and 300 requests a minute are far above a group signing in together. Tiers 1 and 3 count per user, not per IP.
- **`TRUST_PROXY_HOPS` unset in production:** every user shares one IP bucket, and tier 2 would lock everyone out after 10 sign-ins. P2 below detects this, and the fix is one env var.
- **`TRUST_PROXY_HOPS` too high:** a client could spoof `X-Forwarded-For` and dodge tiers 2 and 4. Tiers 1 and 3 still hold, because they count per user.
- **A spoofed `X-Forwarded-For` with hops = 1** is ignored (§3.2).
- **The PWA reopening** fires a handful of GETs. That's far below tier 4.
- **A conversion retry** (`POST /posts/:postId/conversion`) counts toward tier 1, because it launches Chromium.
- **An admin** has no exemption. Admins use the same endpoints.
- **Prune job races a promotion** that Deployment Checks are holding. The current SHA's image is never deleted, and the 4 newest include every production candidate.
- **The registry's image list changes shape** (missing `id`, `createdAt` or `tags`, or an unreadable date): the job deletes nothing and goes red.
- **`gitleaks` false positive:** add an exact-value allowlist entry with a comment, never a path-wide exclusion.
- **Headers block not applied on Vercel:** P4 detects it, and a project-level routing rule is the fallback.

## 8. Test scenarios

**Unit (backend, Vitest)**

- ✅ `env`: `TRUST_PROXY_HOPS` defaults to 0 and accepts `1`.
- ❌ `env`: rejects a negative or non-integer `TRUST_PROXY_HOPS`.
- ✅ `env`: `RATE_LIMITS_DISABLED=true` accepted under `NODE_ENV=test`.
- ❌ `env`: `RATE_LIMITS_DISABLED=true` with `NODE_ENV=production`, and with `NODE_ENV` unset, fails validation.
- ✅ Rate-limit test hooks: `resetRateLimits` empties every tier's counters.
- ❌ Rate-limit test hooks: both throw outside `NODE_ENV=test`.
- ✅ The tier-1 key is the authenticated `userId`; the tier-2 key is `req.ip`.
- ✅ `p-limit` burst: 5 simultaneous conversions, never more than 2 browsers at once; the third starts when a slot frees.
- ❌ `p-limit` burst: queued conversions resolve as `timeout` within `CONVERSION_CEILING_MS`, and one that leaves the queue too late launches no browser.
- ❌ Log audit regressions: one test per finding, asserting the field is absent (filled in from §3.5).
- ❌ Unhandled error logging (if §3.5 changes it): a raw error whose message carries a value doesn't log that message.

**Integration (backend, Supertest)**

- ✅ Tier 1: 10 posts by one user in the window succeed (scraper mocked).
- ❌ Tier 1: the 11th, across any mix of the three endpoints, gets `429`, the standard shape, `Retry-After` and the tier-1 message.
- ✅ Tier 1: a second user is unaffected by the first user's exhaustion.
- ❌ Tier 1: an unauthenticated request gets `401` and does not consume a slot.
- ✅ Tier 2: 10 sign-in attempts from one IP get the normal answers (`200`/`401`).
- ❌ Tier 2: the 11th gets `429` before the token is verified (the Google mock is not called).
- ✅ Tier 2: with `trust proxy` = 1, two different `X-Forwarded-For` client addresses get separate counters.
- ❌ Tier 2: with `trust proxy` = 1, a client-supplied leading `X-Forwarded-For` entry doesn't create a new bucket.
- ❌ Tier 3: the 31st outreach request in an hour gets `429`; friend requests, invitations and community creation share the counter.
- ❌ Tier 4: the 301st request in a minute from one IP gets `429`.
- ✅ Tier 4: `/api/health` is never limited.
- ✅ `RATE_LIMITS_DISABLED=true`: the 11th sign-in goes through.
- ✅ Every `/api` response carries the §3.3 headers and no `X-Powered-By`, including `404` and `500`.
- ❌ A `429` response body contains no internal detail (no key, no IP, no store state).

**Unit (frontend, Vitest)**

- ✅ `vercel.json`: the headers block applies the §3.3 values to every path (extends `vercelConfig.test.ts`).

**Component (frontend, Vitest + RTL)**

- ❌ Community post composer: a `429` keeps the link and text and re-enables Submit.
- ❌ Recommendation composer: same.
- ❌ Welcome: a `429` from `/auth/google` leaves the sign-in button usable.

**CI**

- ✅ `checks / secrets` passes on the cleaned repository.
- ❌ `checks / secrets` fails on a planted fake key. Proven once on a throwaway branch that is deleted unmerged, with the developer's word (CLAUDE.md §11).
- ✅ E2E still green with `RATE_LIMITS_DISABLED=true` set in its workflow env.
- ❌ `planPrune` (unit): 4 or fewer tagged images, an unreadable `createdAt`, more than 10 to delete, and the current SHA's image being old all delete nothing (or throw); untagged entries are never in the plan.
- ✅ `planPrune` (unit): 7 tagged images keep the 4 newest and remove 3.

**E2E** — none new; no golden loop changes.

**Manual — Claude, locally, before the PR**

- M1. Burst: 5 real posts at once against the local Docker image. Record the times and peak memory (§3.4).
- M2. Full-history `gitleaks` scan. Record the result (§3.6).
- M3. The log audit result, written to §9.

**Manual — after the merge, once the Vercel pause ends (2026-11-11)**

- P1. The developer sets `TRUST_PROXY_HOPS=1`, `VERCEL_TOKEN`, Deployment Checks and Preview retention before the merge.
- P2. Per-IP limit: from a laptop, 11 `POST /api/auth/google` calls with a junk token (Claude supplies the exact command); the 11th is `429`. Then sign in on the iPhone over cellular; it succeeds.
- P3. A merge to `main` shows the production deployment waiting for `test:e2e` and `test:docker`, then promoted.
- P4. `curl -I https://bookrough.vercel.app/` and `/api/health` show the §3.3 headers and HSTS.
- P5. After the merge, `prune-images` is green and the Images tab holds at most 4 images.
- P6. A Spotify link posted on production still converts.
- P7. Notifications for a failed scheduled run reach the developer (§3.9).

## 9. Decisions log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Reason                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-07 | Sign-up stays open to any Google account; rate limits instead of a gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Developer: simplest, no friction for new friends; strangers see nothing without an invite or a friendship                                              |
| 2026-11-07 | Rate-limit counters in memory per instance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | No new table or service; resets and per-instance counting are acceptable at friend-group scale, same as `p-limit(2)`                                   |
| 2026-11-07 | `express-rate-limit`, pinned exactly (new dependency approved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Handles memory cleanup, IPv6 subnets and standard headers, and warns on a wrong `trust proxy`                                                          |
| 2026-11-07 | Four tiers as in §3.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Approved by the developer as proposed                                                                                                                  |
| 2026-11-07 | `trust proxy` from `TRUST_PROXY_HOPS`, not a Vercel-specific header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Provider-agnostic (CLAUDE.md §16)                                                                                                                      |
| 2026-11-07 | Baseline security headers, no CSP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A CSP can't be verified on production or an iPhone before the pause ends, and a wrong one breaks sign-in                                               |
| 2026-11-07 | `gitleaks` scan of the full history now, plus a `secrets` job in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Checks the past and guards the future; the branch-protection change is asked for separately                                                            |
| 2026-11-07 | Spec approved by the developer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Stage 1 closed (CLAUDE.md §15)                                                                                                                         |
| 2026-11-07 | Stage 2: `RATE_LIMITS_DISABLED` allowed only under `NODE_ENV=test`, not merely refused in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Stricter, and the same rule as the stand-ins: a host that forgets `NODE_ENV` defaults to development                                                   |
| 2026-11-07 | Stage 2: limiters are module-level, with test-only reset and enable hooks, instead of a factory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The routers are module-level, so per-`createApp()` limiters would need every router rebuilt                                                            |
| 2026-11-07 | Stage 2: correction — `express-rate-limit` 8.7.3 has two dependencies, `debug` (already installed) and `ip-address`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Stage 1 said it had none; it adds one new package to the lockfile                                                                                      |
| 2026-11-07 | Stage 2: page headers live in the `web` service's `headers`, not at the top level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Vercel's Services routing documentation: each service owns its headers                                                                                 |
| 2026-11-07 | Stage 2: registry pruning calls the REST API from a Node script, not the Vercel CLI; dry run until `PRUNE_IMAGES=delete`; tagged images only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The REST response is documented JSON where the CLI's output is not, no new tool is needed, and the first run's plan is read before anything is deleted |
| 2026-11-07 | Stage 2: reviewed `gitleaks` false positives go in `.gitleaksignore` by fingerprint, not `.gitleaks.toml` patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Exact per finding; a pattern would also hide a future real value                                                                                       |
| 2026-11-07 | M2 — history scan (`gitleaks` 8.30.1, all refs, 47 commits): 5 findings, all test fixtures — invite tokens in 3 test files, and the E2E Google stand-in key and its signer (committed on purpose, refused outside `NODE_ENV=test`). No real secret; nothing to rotate                                                                                                                                                                                                                                                                                                                                                                                                                                             | §3.6                                                                                                                                                   |
| 2026-11-07 | M3 — log audit, 59 calls plus the request serializer and the error handler: every call logs ids, counts, outcomes and our own messages only; no email, token, name, search text, invite token or IP. One finding: an unhandled Prisma error was logged raw, and its message can render query values. Fixed by an `err` serializer (`utils/safeError.ts`) that keeps the class, code, model and field names and the stack frames                                                                                                                                                                                                                                                                                   | §3.5                                                                                                                                                   |
| 2026-11-07 | Stage 3 `/code-review` (high): 9 findings. Fixed 8: the `secrets` job now fails when gitleaks scans zero commits; pino-http gets the safe `err` serializer too; a withheld Prisma error wrapped as a `cause` no longer leaks through its wrapper; only Prisma's request and validation errors are withheld, so connection errors keep their message; the prune script's entry check uses `pathToFileURL`; `RATE_LIMITS_DISABLED` forgives case and spaces; `/api/health/` is skipped too; `signInLimit` runs before `requireAuth` on `google-picture`. The ninth (new dependencies not yet in `docs/tech stack.md`) is closed by this PR's doc commit, and the squash merge lands it in the same commit on `main` | CLAUDE.md §15 Stage 3                                                                                                                                  |
| 2026-11-07 | Stage 3 `/security-review`: no finding at confidence 8 or above. Checked: secrets reach no PR code (`pull_request`, not `pull_request_target`); no untrusted `${{ }}` in a `run:`; the token is never printed; the prune script's host is fixed and its path segments encoded; `RATE_LIMITS_DISABLED` is test-only; the 429 path logs no key or IP                                                                                                                                                                                                                                                                                                                                                                | CLAUDE.md §15 Stage 3                                                                                                                                  |

## 10. Doc updates (same PR)

- `DEVELOPMENT.md` Step 6.4: replace the stale task list, then fill in What I did and How to view & test (CLAUDE.md §13).
- `CLAUDE.md`: §2 (`express-rate-limit`, `gitleaks`), §10 (five PR jobs), §16 (Deployment Checks live, registry pruning).
- `docs/tech stack.md` + `.docx`: §5 `express-rate-limit`; §5.2 `gitleaks`, and the Vercel REST API with `VERCEL_TOKEN` (§5).
- `docs/deployment.md` + `.docx`: §3.5 burst measurement; §3.6 Deployment Checks, pruning, `TRUST_PROXY_HOPS`; §7 checklist.
- `docs/tests.md` + `.docx`: the `secrets` job and `RATE_LIMITS_DISABLED` in E2E.
- `docs/git workflow.md` + `.docx`: the fifth required check.
- `docs/system architecture conventions.md` + `.docx`: the rate-limit middleware and the `429` response.
- `docs/features/production-deploy.md` and `deployment-storage.md`: decision-log rows pointing here.
- `HANDOFF.md`: §3 item 3, §4 (the developer's dashboard steps), §5 (`VERCEL_TOKEN` and its renewal date).
