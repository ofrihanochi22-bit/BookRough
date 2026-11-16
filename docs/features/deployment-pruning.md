# Feature: Deployment pruning

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| **Use cases** | No new UC. Operations: keeps the deployed product (every UC) inside the Hobby limits |
| **Phase**     | 6 (production hardening; replaces production-hardening.md §3.8)                      |
| **Branch**    | `chore/prune-deployments`                                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                   |

---

## 1. Goal

Every production deployment keeps a copy of the backend function image in **Functions Storage** (Hobby cap 10 GB; going over a Hobby storage meter paused the team for 30 days in October 2026). On 2026-11-16 it read 6.07 GB (61%, Watch) after nine production deploys in a week, and the developer deleted ten old deployments by hand. Vercel offers only age-based retention, not count-based. After this ships, a CI job deletes old production deployments after each push to `main` and nightly, so only the live deployment and its rollback target remain, and nobody has to clean up by hand.

The failing registry job `prune-images` is removed in the same change: Vercel answers every registry (VCR) call from this account with `403`, even with a new token, so on Hobby it can never work.

**Step 0, done 2026-11-16, proves the API is open to us:** `GET /v6/deployments` listed the production deployments (PR #75, read-only probe), and one deployment the developer chose, `dpl_3tMY…` (commit `53c04a0`), was deleted with `DELETE /v13/deployments/{id}` → `HTTP 200 {"state":"DELETED"}`.

## 2. Scope

**In scope**

- `backend/src/ops/pruneDeployments.ts`: lists, decides, prints, and — only when enabled — deletes. The decisions sit in a pure, unit-tested `planDeploymentPrune`.
- A `prune-deployments` job in `main.yml`.
- A dry run until the repository variable `PRUNE_DEPLOYMENTS` is `delete`, the same pattern as `PRUNE_IMAGES`.
- Removing `prune-images`, `pruneImages.ts`, its tests, the temporary `probe-deployments` job and the `--probe-deployments` mode. `failureDetail` moves to the new file unchanged.
- Docs: this spec; an amendment note in `production-hardening.md` §3.8; `deployment-storage.md`; `deployment`, `tech stack`, `tests` (`.md` + `.docx`); CLAUDE.md §10 and §16; `HANDOFF.md`; the `/vercel-usage` skill's remedy text; `DEVELOPMENT.md`.

**Out of scope**

- **Preview deployments.** Only branches opted in by name in `vercel.json` get them, and preview retention is already 7 days.
- **Registry images and Images Storage.** No API is available to us. If Images Storage climbs, `/vercel-usage` says so and the developer deletes old images in the project's Images tab. Whether deleting a deployment also frees its image is not known; see §8.
- **Vercel's own retention settings, tokens, and repository variables** — the developer's (CLAUDE.md §11).
- Any app code, schema, endpoint or screen.

## 3. Data model changes

None.

## 4. API

No BookRough endpoint. The job calls Vercel's documented REST API with `fetch` and `VERCEL_TOKEN` (Bearer header), team slug `VERCEL_TEAM` as `slug=`, project `bookrough` (overridable by `VERCEL_PROJECT`):

| Call                                                                                 | Use                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v9/projects/{project}`                                                         | `targets.production.id` — the live deployment                                                                                            |
| `GET /v6/deployments?projectId={project}&target=production&limit=100[&until=<next>]` | every production deployment, following `pagination.next`, at most 10 pages                                                               |
| `GET /v13/deployments/{id}`                                                          | the Deployment Checks (`checksState`, `checksConclusion`) of each READY production deployment but the live one: the list leaves them out |
| `DELETE /v13/deployments/{id}`                                                       | delete one; `200` done, `404` already gone                                                                                               |

Any other status, or a body in an unexpected shape, stops the run with Vercel's reason (`failureDetail`) and deletes nothing more.

## 5. The job and its decisions

### 5.1 When it runs

- `prune-deployments` in `main.yml`, `needs: [test-e2e, test-docker]`, on `push` to `main`, on the nightly `schedule`, and on `workflow_dispatch`. On a push or a dispatch it runs only if both suites passed; nightly it runs whatever they did, because nothing deploys at night and a flaky live squigly.link test must not stop the run that settles the count. After a push, the new deployment is usually still building or waiting on Deployment Checks, so the push run cannot yet count it as READY; the nightly run settles the count to 2 once it has been promoted.
- Node 24 with type stripping (`node backend/src/ops/pruneDeployments.ts`), no package and no CLI, like the job it replaces.

### 5.2 What it keeps and deletes — `planDeploymentPrune(deployments, { liveId, keep: 2, maxDeletes: 10 })`

Pure; throws rather than guessing.

1. **The live deployment** (`liveId`) is always kept, whatever its state. If `liveId` is missing, or not in the list, the run deletes nothing and fails.
2. **Anything not finished** is kept and does not count: every state other than `READY`, `ERROR` and `CANCELED` (`BUILDING`, `QUEUED`, `INITIALIZING`, any state Vercel adds later), and a `READY` deployment whose Deployment Checks are still `registered` or `running`.
   **A READY deployment whose checks ended `failed` or `canceled`** (`checksConclusion`) will never be promoted: it is treated as a failure (rule 4), never as the rollback target.
3. **READY deployments:** keep 2 in all — the live one plus the newest other READY deployment (by `created`). Every older READY one is deleted.
4. **ERROR / CANCELED deployments, and READY ones that failed their checks,** are deleted once superseded: when a READY deployment created after them exists. The newest failure, with nothing READY after it, stays for debugging.
5. **Only `target: production`** is ever a candidate; anything else in the list is kept.
6. **At most 10 deletions per run.** More means something is wrong with the listing: the run deletes nothing and fails, and the developer deletes by hand.
7. Every run prints the live id, then each deployment with its id, creation time, short SHA, state and verdict (`keep (live)`, `keep (rollback)`, `keep (unfinished)`, `delete`).

### 5.3 Dry run until enabled

It deletes only when `PRUNE_DEPLOYMENTS` is exactly `delete`; any other value is a dry run, which prints `Would delete (dry run)`. The developer sets the variable after reading a dry run on `main`.

### 5.4 Failure is loud

A missing `VERCEL_TOKEN` or `VERCEL_TEAM`, a non-OK status, or an unexpected shape fails the job (red `main`, fixed first — CLAUDE.md §10) rather than skipping silently. The token is only ever in a header; Vercel does not echo it; nothing secret is printed.

## 6. Edge cases & failure modes

- **Promotion during a run.** The newly promoted deployment is the newest READY one, so it is kept as either live or rollback; the old live becomes the rollback target or, at worst, is deleted only by the next run, when it is no longer live.
- **The developer rolls back or promotes during a run.** A Hobby rollback goes to the rollback target, which rule 3 keeps. A dashboard promote of an older deployment could pick one the plan deletes, so a deleting run reads the live id again just before its first deletion and, if it changed, deletes nothing and fails; the next run plans afresh.
- **A deletion fails half-way.** The run stops at the first failure; the ones already deleted stay deleted, which is the intended end state anyway. The next run continues.
- **`404` on delete** (deleted by hand meanwhile) counts as done.
- **More than 1,000 production deployments** (10 pages) — refuses, deletes nothing.
- **A deployment with an unreadable `created`** — refuses, deletes nothing.
- **Two runs at once** (a push and the nightly) — both compute the same plan; the second gets `404`s, which count as done.

## 7. Test scenarios

**Unit — `planDeploymentPrune`**

- ✅ Keeps the live and the newest other READY, deletes older READY ones.
- ✅ The live one is kept even when it is not the newest (after a rollback); the newest other READY is its pair.
- ✅ Two READY or fewer: deletes nothing.
- ✅ BUILDING / QUEUED / INITIALIZING and an unknown state are kept and not counted.
- ✅ READY with checks `registered` or `running` is kept and not counted; with checks `completed` and `succeeded` it counts.
- ✅ READY with checks `completed` and `failed` is never the rollback target: the older READY one is kept, and it is deleted once a newer settled READY exists.
- ✅ ERROR / CANCELED older than a READY one are deleted; the newest failure with nothing READY after it is kept.
- ✅ A non-production deployment in the list is kept.
- ❌ `liveId` missing or not in the list: throws.
- ❌ An unreadable `created`: throws.
- ❌ More than `maxDeletes`: throws.

**Unit — config and calls (mocked `fetch`)**

- ✅ `readConfig`: dry run by default, deleting only for exactly `delete`; project default `bookrough`.
- ❌ `readConfig`: missing or blank `VERCEL_TOKEN` / `VERCEL_TEAM` throws.
- ✅ `readLiveId` returns `targets.production.id`; ❌ a non-OK status throws with Vercel's reason; ❌ no id throws.
- ✅ `listDeployments` follows `pagination.next` across pages; ❌ a non-OK status throws with the reason; ❌ an unexpected shape throws; ❌ more than 10 pages throws.
- ✅ `deleteDeployment` accepts `200` and `404`; ❌ `403` / `500` throw with the reason.
- ✅ `failureDetail` keeps its existing cases.

**Integration, component, E2E:** none — no endpoint or screen. The real check is the first dry run on `main`, then the first deleting run, read in the job log, then `/vercel-usage` a day later.

## 8. Open questions

- **Does deleting a deployment free its image in Images Storage?** Unknown. After the first deleting run, `/vercel-usage` readings over the next day answer it; the answer goes in §9 and in `deployment-storage.md`. It changes nothing in this job either way.

## 9. Decisions log

| Date       | Decision                                                                                                                           | Reason                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Keep 2 READY production deployments (live + rollback target)                                                                       | Hobby can only roll back to the previous deployment, so a third buys nothing (developer)                                                                                      |
| 2026-11-16 | Delete ERROR / CANCELED production deployments once a newer READY exists                                                           | Keeps the list clean; the newest failure stays for debugging (developer)                                                                                                      |
| 2026-11-16 | Remove `prune-images` and its code                                                                                                 | Every registry call gets `403` on this plan, even with a new token; a permanently red job hides real failures (developer)                                                     |
| 2026-11-16 | A READY deployment that failed its checks is a failure; the live id is re-read before deleting; the nightly run ignores red suites | `/code-review`: a never-promoted build could take the rollback slot, a dashboard promote could race the deletions, and the live squigly.link test could skip the settling run |
| 2026-11-16 | Checks are read per deployment from `GET /v13/deployments/{id}`                                                                    | The first dry run on `main` showed the list endpoint returns no `checksState` / `checksConclusion`, so the failed-checks guard could never trigger                            |
| 2026-11-16 | New spec instead of rewriting production-hardening.md §3.8                                                                         | §3.8 records a shipped, now-withdrawn design; it gets an amendment note pointing here                                                                                         |
