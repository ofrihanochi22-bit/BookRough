# Feature: Deployment storage

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                   |
| ------------- | --------------------------------------------------------------------------------- |
| **Use cases** | None directly — keeps the deployment every UC runs on within its free tier (§16)  |
| **Phase**     | 6 — a fix to Step 6.3 (`production-deploy.md`), shipped between Steps 6.1 and 6.2 |
| **Branch**    | `chore/vercel-storage`                                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                |

---

## 1. Goal

On 2026-10-11 Vercel warned that the Hobby team had used 75% of its 10 GB of **Function Storage** (deployment storage). Every deployment Vercel keeps holds its own copy of the backend image, and that image was 3.12 GB — so two or three kept deployments filled the allowance, and going over it "can block you from deploying until you free some up" (Vercel changelog, below). After this ships, the worst case fits with room to spare, however often we deploy:

> **worst case ≈ deployments Vercel must keep × image size ≈ 3 × 1.2 GB ≈ 4 GB of 10 GB**

The developer asked for the safest option and a way to avoid the situation altogether (2026-10-11), and approved this plan in advance.

### 1.1 What Vercel keeps (Hobby, from 2026-09-16)

- The 3 most recent production deployments and the 3 most recent deployments of any type, whatever their age.
- The current production deployment, aliased deployments, and **the latest preview of every active branch**.
- Over 10 GB, every other deployment is deleted at once instead of after 30 days. Whether protected deployments alone may exceed the allowance is not documented; that is the case this feature removes.

Sources: [Hobby projects now retain fewer deployments](https://vercel.com/changelog/hobby-projects-now-retain-fewer-deployments-to-free-up-storage), [Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

## 2. Scope

**In scope**

- `vercel.json`: only `main` deploys; any other branch only when it opts in by its exact name (§3.1).
- `backend/Dockerfile`: a `node:24.21.0-bookworm-slim` base with only Chromium's headless shell and its libraries (§3.2).
- `main.yml` `test:docker`: a step that launches Chromium inside the image (§3.3).
- Doc updates (§9) — including the correction of `production-deploy.md`'s M4, which recorded "no limit".

**Out of scope**

- Trimming `node_modules` (345 MB, mostly Prisma's CLI and engines). Not needed to fit; a later change if it ever is.
- Moving the backend off Vercel (Cloud Run, the agreed fallback, needs a card and bills overage — less safe, not more).
- A paid plan, or deleting deployments from code (no Vercel SDK or token — CLAUDE.md §16).

## 3. Design

### 3.1 Previews are opt-in

```json
"git": { "deploymentEnabled": { "**": false, "main": true } }
```

`**` matches every branch name, slashes included; when rules conflict, any `true` wins, so `main` deploys. **A branch that needs a preview** (a PWA check on a real iPhone, as in Steps 6.1 and 6.2) adds its own exact name — `"feat/pwa-offline": true` — in its own `vercel.json`, and the line is removed before the merge. Vercel reads `vercel.json` from the pushed commit. The routing test enforces the shape: `**` off, `main` on, and any other `true` key a literal branch name, never a pattern.

Effect: a preview is a deliberate act that costs one image (~1.2 GB) for as long as the branch lives. CI already gates every PR (`pr.yml`), so nothing else used the previews.

### 3.2 The slim image

| Before                                                      | After                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `mcr.microsoft.com/playwright:v1.63.0-noble` (2.51 GB base) | `node:24.21.0-bookworm-slim` (Debian 12, Node pinned exactly — supported by Playwright) |
| Chromium, Firefox, WebKit                                   | Chromium's headless shell only — what `chromium.launch({ headless: true })` runs        |
| Image tag kept in step with `package.json` by hand          | The browser comes from the `playwright` package in the lockfile — always in step        |
| User `pwuser`                                               | User `node` (the base image's non-root user)                                            |
| `HEALTHCHECK` with `curl`                                   | `HEALTHCHECK` with Node's `fetch` (no `curl` in the slim base)                          |
| 2.85 GB locally, 3.12 GB in Vercel's registry               | **1.17 GB** locally                                                                     |

- `playwright install --with-deps --only-shell chromium` runs as root (it installs system libraries with `apt`), into `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, so the unprivileged user finds it.
- `openssl` and `ca-certificates` are installed for Prisma's engine and its TLS connection to Neon; the build stage installs `openssl` too, so `prisma generate` picks the right engine.
- Unchanged: multi-stage build, `tini` as PID 1, non-root, migrations on start, the start command, port 4000.

### 3.3 CI

`test:docker` gains **"Chromium launches inside the image"**: inside the running container, launch the browser with the converter's own `LAUNCH_ARGS` and render a page. A missing system library would otherwise break every conversion while `/api/health` stayed green. Verified both ways locally: passes in the image; fails (exit 1) when the browser cannot be found.

## 4. Data model changes

None.

## 5. API

None.

## 6. Screens & components

None.

## 7. Edge cases & failure modes

- **A library Chromium needs is missing on Vercel but not locally.** Same image, so unlikely; `test:docker` launches it after every merge, and the first production conversion is checked by hand (§8). Rollback: Vercel → Deployments → the previous production deployment → Instant Rollback.
- **Vercel ignores `deploymentEnabled` for a branch.** Community reports tie this to Preview branch tracking being off. If this PR's own push builds a preview, the developer checks Settings → Environments → Preview → branch tracking. The cost of the failure is one ~1.2 GB preview, not a blocked account.
- **An opt-in line merges by mistake.** Harmless — the branch is deleted after the merge, so the name never matches again. The test still allows only an exact name.
- **Old 3 GB images.** Until Vercel retires them, the old production deployments still count. Merging this adds one ~1.2 GB production deployment (≈ 75% + 12%); the developer deletes old preview deployments in the dashboard (§8).
- **Node updates** are deliberate: the base tag is pinned to `24.21.0` (the version tested here), and moving it is a toolchain change (CLAUDE.md §11).
- **Opting a branch in does not build a preview.** This PR proves only the off half; the on half is first exercised by Step 6.2. If Vercel ignores the branch's own line, the developer starts the preview by hand: Vercel → Deployments → Create Deployment → the branch. Recorded in Step 6.2 either way.

## 8. Test scenarios

**Unit — frontend (Vitest)**

- ✅ `vercel.json`: `**` is off, `main` is on, and any other enabled key is an exact branch name.

**CI — `test:docker` (`main.yml`)**

- ✅ Builds, starts against an empty Postgres, applies every migration, stops with exit code 0, no error-level log line (unchanged).
- ✅ Chromium launches inside the image with `LAUNCH_ARGS` and renders a page (new).

**Manual — Claude, local Docker, before the PR (2026-10-11)**

- ✅ Image size 1.17 GB (layers: browser and its libraries 589 MB, production `node_modules` 345 MB).
- ✅ `/api/health` 200; all 14 migrations applied to an empty database; `/api/settings` answers.
- ✅ One real conversion inside the container: Spotify → `converted` with five links in 2.4 s.
- ✅ Health status `healthy`; ~114 MB memory after the conversion; `docker stop` exit 0; no error-level log line.
- ✅ The CI Chromium step passes in the image and fails without a browser.

**After the merge**

- S1. This PR's branch builds no preview on Vercel (Claude: no Vercel check on the PR).
- S2. Production builds green and `GET https://bookrough.vercel.app/api/health` is `200` (Claude).
- S3. A real Spotify link posted in production gets an Apple Music link (the developer, signed in).
- S4. Vercel → Usage → Function Storage falls as old deployments are removed (the developer, within a day).

## 9. Decisions log

| Date       | Decision                                                                                | Why                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | Both fixes in one PR, not "previews first" as first proposed                            | Merging a previews-only PR would itself deploy one more 3.1 GB production image; merging both adds ~1.2 GB |
| 2026-10-11 | Previews opt-in by exact branch name instead of off entirely                            | Step 6.2's iPhone checks need a preview (`pwa-offline.md` §3.6)                                            |
| 2026-10-11 | Headless shell only (`--only-shell`), not full Chromium                                 | It is exactly what `headless: true` launches; full Chromium would add size and nothing used                |
| 2026-10-11 | Base image changed (CLAUDE.md §11 asks first) — approved by the developer with the plan | "As safe as possible" — the worst case had no bound before                                                 |

## 10. Doc updates (same PR)

- `docs/deployment.md` + `.docx`: §3.5 the base, user, measurement and storage; §3.6 deploys.
- `docs/tech stack.md` + `.docx`: Docker entry (base image).
- `docs/link converter implementation guide.md` + `.docx`: the Dockerfile example.
- `CLAUDE.md`: §2 Infra, §7, §16.
- `docs/features/backend-docker.md` and `production-deploy.md`: decision-log rows; M4 corrected.
- `DEVELOPMENT.md`: this step (§13).
