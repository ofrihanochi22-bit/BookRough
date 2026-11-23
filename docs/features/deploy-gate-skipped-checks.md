# Feature: The deploy gate holds when `checks` fails

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Use cases** | None directly: CI and deployment, Phase 6 (a fix to Step 6.4, production-hardening.md §3.7) |
| **Phase**     | 6                                                                                           |
| **Branch**    | `fix/deploy-gate-skipped-checks`                                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☐ Tested · ☐ Merged                          |

---

## 1. Goal

A commit on `main` whose shared checks fail (`lint`, `typecheck`, `test:unit`, `test:integration`, `secrets`) is never promoted to production. Until now it was: `test:e2e` and `test:docker` were then skipped, and Vercel's Deployment Checks let a skipped check through.

## 2. What happened (evidence)

On 2026-11-19 the merge of PR #87 (`461b144`) ran `main.yml` as run 44533585501:

| Job (GitHub check run) | Conclusion | Completed (UTC)   |
| ---------------------- | ---------- | ----------------- |
| `checks / test:unit`   | failure    | 13:28:42          |
| `checks / *` (other 4) | success    | 13:27:22–13:29:50 |
| `test:e2e`             | skipped    | 13:29:51          |
| `test:docker`          | skipped    | 13:29:51          |
| `prune-deployments`    | skipped    | 13:29:51          |

Vercel deployment `dpl_CMi8U7nLzTxa32pZNffLTWRWRd5y` (target `production`, commit `461b144`) was created at 13:27:11 and finished building at 13:28:00. GitHub's Production deployment for that commit was created at **13:29:53**, with the status "Deployment has completed" at 13:29:54, **two seconds after both gated checks concluded `skipped`**. It became production (it received the `bookrough.vercel.app` alias) until PR #88's deployment replaced it at 13:47.

So the Deployment Checks are set up and were waiting: the deployment was built but held for 1 min 53 s, then released the moment the two checks concluded. The same pattern, for each conclusion:

| Commit    | `test:e2e` / `test:docker` | GitHub Production status                               |
| --------- | -------------------------- | ------------------------------------------------------ |
| `d3ef14d` | failure / success          | failure, 11:33:33: "Checks for Deployment have failed" |
| `c0df513` | failure / success          | failure, 15:03:49: "Checks for Deployment have failed" |
| `d74646b` | success / success          | success, 13:47:45, 5 s after `test:e2e` passed         |
| `461b144` | **skipped / skipped**      | **success, 13:29:54**, 2 s after both were skipped     |

**Cause:** Vercel treats a GitHub check that concludes `skipped` as not blocking, like `success` (its own check vocabulary has `skipped` and `neutral` beside `failed`; only a failure blocks). `main.yml` produced `skipped` because `test:e2e` and `test:docker` had `needs: [checks]` and no `if:`, and GitHub skips a job whose needed job failed. Nothing else let it through: no manual promotion, and the gate works for failures.

## 3. Scope

**In scope**

- `test:e2e` and `test:docker` always run (`if: ${{ always() }}`), and their first step fails the job when `needs.checks.result` is anything but `success`, or the run was cancelled (`cancelled() ||` in the step's `if:`, because once a run is cancelled a step without a status function is skipped). The check then reaches Vercel as `failure`, and production is held, as for `d3ef14d`.
- The guard step runs before checkout, so no browsers are installed and no image is built. The cost is the runner and the Postgres service container starting, about half a minute per job, only on a red run.
- `always()` rather than `!cancelled()`: a cancelled run would otherwise leave both jobs skipped, which Vercel would let through again.

**Out of scope**

- Any Vercel dashboard change. The Deployment Checks stay `test:e2e` and `test:docker`.
- An always-run gate job with a new name: it would need a new Deployment Check in the dashboard, and the existing two would still pass on `skipped`.
- `pr.yml`: its five jobs (`ci.yml`) have no `needs:` and no `if:`, so a failure never turns another one into `skipped`, and nothing deploys from it.
- `prune-deployments`: unchanged. On a push it still runs only when both suites succeed.

## 4. Data model changes

None.

## 5. API

None.

## 6. Screens & components

None.

## 7. Edge cases & failure modes

- **Nightly run with a red `checks`:** both suites now fail fast instead of being skipped. The run was already red, and `prune-deployments` still runs on a schedule (its condition is `!cancelled()` and event `schedule`).
- **Run cancelled before a suite starts:** both jobs start, the guard runs because of `cancelled()` and fails them, and Vercel holds the deployment. A later push or a re-run releases it.
- **Run cancelled while a suite itself is running:** that check concludes `cancelled`. Whether Vercel blocks on `cancelled` is not verified; this was already the case before this fix.
- **Re-running the failed jobs** after a flaky `checks` failure: GitHub re-runs the failed job and the two suites that depend on it. If they pass, Vercel should release the held deployment; not yet observed, so it is part of M2.

## 8. Test scenarios

`main.yml` runs only on `main`, nightly and on dispatch, and a dispatched run would also run `prune-deployments` against production, so this is checked after the merge:

- ✅ M1. The merge of this PR: all jobs green, the guard step shows as skipped in both suites, and production is promoted after `test:e2e` passes.
- ❌ M2. The next red `checks` on `main` (or a nightly one): `test:e2e` and `test:docker` conclude `failure` at the guard step, and the commit's GitHub Production deployment status is "Checks for Deployment have failed". If the failed jobs are then re-run green, the deployment is promoted.
- Before the merge: the workflow parses as YAML, and the guard's condition and both `if:` lines are read back from the parsed file.

## 9. Decisions log

| Date       | Decision                                                                                       | Reason                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-11-22 | Cause: Vercel lets a `skipped` check through; `main.yml` skipped both suites on a red `checks` | §2: four commits, one per conclusion, and the 2 s gap between the skip and the promotion           |
| 2026-11-22 | Fix in `main.yml` (guard step), not in the dashboard                                           | Keeps the two existing Deployment Checks; no dashboard step for the developer                      |
| 2026-11-22 | `always()`, not `!cancelled()`                                                                 | A cancelled run must not leave the checks skipped either                                           |
| 2026-11-23 | Spec approved by the developer                                                                 | Stage 1 closed (CLAUDE.md §15); the fix was built first because the task asked for a spec or a fix |
