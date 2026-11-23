# Feature: Pruning waits while production is held in checks

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | No new UC. Operations: a fix to deployment-pruning.md (Phase 6)    |
| **Phase**     | 6                                                                  |
| **Branch**    | `fix/prune-waits-for-promotion`                                    |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

`prune-deployments` no longer turns `main` red just because the newest production deployment is still waiting in Vercel's Deployment Checks. It waits briefly for the promotion. If production is still held after that, it prunes nothing and says so in a warning, and the job stays green. It still fails, deleting nothing, when the listing looks wrong.

## 2. What happened (evidence)

On 2026-11-23 two runs of `main.yml` in a row failed at `prune-deployments` with "The live deployment dpl_98Ty52dczExuhtm68x3bHWSS5tnc is not marked as promoted in the list; deleting nothing.":

| Run         | Commit    | `test:e2e` passed | Prune failed | Production promoted                         |
| ----------- | --------- | ----------------- | ------------ | ------------------------------------------- |
| 45203457446 | `f45302f` | 15:25:49          | 15:26:02     | `dpl_98Ty…` was `f6121df`'s, then in checks |
| 45204820524 | `f6121df` | 15:33:53          | 15:33:58     | 15:34:01, 3 s after the prune               |

`readLiveId` takes the project's `targets.production`. Vercel points it at the **newest** production deployment as soon as it's built, even while Deployment Checks still hold it. So the live id is a deployment that isn't promoted yet, and the guard that was meant to catch changed Vercel fields fires instead. Two cases:

- **Its own promotion:** Vercel promotes a few seconds after `test:e2e` and `test:docker` pass, and `prune-deployments` starts in the same seconds (PR #89's run was lucky: promoted at 15:03:26, pruned at 15:03:34).
- **A newer push:** a run whose commit is no longer the newest sees the next push's deployment, held for the whole length of that push's suites (about 10 minutes).

Both failures deleted nothing, as designed. The nightly run would have settled the count.

## 3. Scope

**In scope** — `backend/src/ops/pruneDeployments.ts` only:

- **Wait for promotion.** When the production target isn't promoted, but it is a READY production deployment newer than the newest promoted one (that is, held in checks), read the project and the list again: up to 12 reads, with 11 waits of 10 seconds between them (under 2 minutes). As soon as the target is promoted, plan and prune as today.
- **Still held after 2 minutes:** print a `::warning::` ("Production deployment X is still waiting in Deployment Checks; pruning nothing this run."), delete nothing, post no Overview snapshot, and exit 0. The next push or the nightly run prunes.
- **Still a failure (exit 1, deleting nothing), as today:** the production target is missing from the list; no deployment in the list is promoted at all (Vercel's fields changed); or the target is not promoted and is older than a promoted one, or not READY.
- The waiting is a small function with an injectable `sleep`, so it is unit-tested without real delays.

**Out of scope**

- `main.yml`: no change. The job's `needs:` and `if:` stay.
- Planning against "the newest promoted deployment" instead of the production target. That would change what counts as live, which the existing guards and tests are built on.
- Vercel's dashboard settings.

## 4. Data model changes

None.

## 5. API

None. (Vercel's REST API: the same two reads, `GET /v9/projects/{project}` and `GET /v6/deployments`, repeated while waiting.)

## 6. Screens & components

None. Admin → Overview keeps showing the last snapshot when a run skips.

## 7. Edge cases & failure modes

- **A deployment that failed its checks** stays the production target until the next push. Every run, nightly included, waits 2 minutes and warns, so storage isn't pruned until the next push. The warning shows on the run's summary page.
- **Production moves while waiting** (a later push, or a promote in the dashboard): each attempt reads the target again, and the existing re-read before deleting still applies.
- **The wait costs runner time**: at most 2 minutes, only when production is held.
- **A dry run** (`PRUNE_DEPLOYMENTS` not `delete`) waits the same way, so the printed plan is the real one.

## 8. Test scenarios

**Unit (`pruneDeployments.test.ts`)**

- ✅ The target is promoted at once: no sleep, one read of each.
- ✅ Held, then promoted on the third attempt: two sleeps, and the plan is made from the third listing.
- ✅ Held for all 12 attempts: returns "held" after 11 sleeps of 10 s; nothing deleted.
- ❌ No deployment in the list is promoted: throws without waiting.
- ❌ The target is not promoted and older than a promoted deployment: throws without waiting.
- ❌ The target is not promoted and not READY: throws without waiting.
- ❌ The target is missing from the list: throws without waiting (as today).

**After the merge**

- M1. The merge's own run: `prune-deployments` is green; if it waited, the log shows "waiting for promotion" lines, then the plan.
- M2. The four deployments left by the two failed runs are pruned to two by the first green run.

## 9. Decisions log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                    | Reason                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2026-11-23 | Wait up to 2 minutes, then warn and exit 0                                                                                                                                                                                                                                                                                                                                  | Covers its own promotion (seconds) without holding a runner for a newer push's ~10 minutes |
| 2026-11-23 | Spec approved: the developer left the call to Claude ("trust you to decide")                                                                                                                                                                                                                                                                                                | CLAUDE.md §15 Stage 1                                                                      |
| 2026-11-23 | Stage 3 `/code-review` (high), 5 nits: the spec's wait wording (fixed: 12 reads, 11 waits) and the missing DEVELOPMENT.md step (fixed). Not changed: a deployment that failed its checks now warns instead of failing (§7, and its own run is already red); the default `sleep` and `write` are untested wiring, like `main`; the planner keeps its own guards as a defence | CLAUDE.md §15 Stage 3                                                                      |
| 2026-11-23 | "Held" means READY, production, not promoted, newer than every promoted one                                                                                                                                                                                                                                                                                                 | Keeps the original guard against changed Vercel fields for every other shape               |
