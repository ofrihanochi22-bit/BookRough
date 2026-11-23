# Feature: Burst load test for sending recommendations

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                       |
| ------------- | --------------------------------------------------------------------- |
| **Use cases** | UC-20 (direct recommendations), UC-11 (the link conversion behind it) |
| **Phase**     | 6 (production hardening)                                              |
| **Branch**    | `chore/load-test`                                                     |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged    |

---

## 1. Goal

Measure how the backend behaves when many friends send songs at almost the same moment. Rounds of **10, 20, 30, 40 and 50** `POST /api/recommendations` requests are each spread over **5 seconds**. For every request the tool records how long it took and how it ended. It catches every failure, and writes a report that answers four questions:

1. Does any request fail (5xx, dropped connection, timeout) or lose the user's post?
2. Does the 12 s ceiling hold for every request, however long the queue (CLAUDE.md §7)?
3. How many posts convert, and how many are saved as `conversion_pending`, at each load?
4. Does the container stay within its memory, and do other endpoints stay responsive during a burst?

Today the only measurement is one burst of five posts (docs/deployment.md §3.5, 2026-11-07). This extends it to 50 posts and makes it repeatable.

## 2. Scope

**In scope**

- A hand-run script in `backend/scripts/load-test/`, beside `mock-data/`, written in TypeScript and run with `tsx`. It uses Node's built-in `fetch`, so **no new dependency** is added.
- The target is **the backend Docker image, built and run locally**, limited to `--memory=2g --cpus=1` to match a Vercel Hobby instance (docs/deployment.md §3.6). It uses its own database, `music_app_loadtest_db`, in the local Postgres container. That database is wiped and migrated at the start of each run, the same way as the test database.
- The **real** converter: headless Chromium against squigly.link. That is the code path whose behaviour under load is in question.
- An HTML report, with the raw data as JSON beside it (§5).
- Unit tests for the script's pure parts: the schedule, the statistics and the report rendering (§7).

**Out of scope**

- **Production (`bookrough.vercel.app`) and Neon.** A load test there would use Hobby's active-CPU hours and Neon's compute hours, and would mix test rows with real users. A breached quota pauses the whole team for 30 days (CLAUDE.md §16). The local image is the same `Dockerfile` with the same limits.
- **The E2E stand-in converter (`E2E_SCRAPER_FIXTURES`).** It returns a canned result _before_ the `p-limit(2)` queue (`linkScraper.service.ts:125-128`), so it would test nothing about the queue.
- **Several instances.** Vercel may start more containers under load. Each one has its own `p-limit` and its own in-memory rate-limit counters. One container is the worst case for the queue, and that is what this test measures.
- **Community posts (`POST /api/communities/:id/posts`).** They share `convertLink` and the same queue with direct recommendations, so measuring one of them answers for both.
- **Link-only posts (Bandcamp, SoundCloud).** They skip Chromium, so they don't wait in the queue.
- **CI.** The test is slow (about 5 minutes) and uses a live third-party site. It is not part of `pr.yml` or `main.yml`.
- **Load-testing tools such as k6 or Artillery.** They would add a dependency (CLAUDE.md §11), and they would not measure what matters here: the container's memory, and the server-side outcome of each post.

## 3. Data model changes

None. The script seeds its own users directly into `music_app_loadtest_db` with Prisma:

- 50 **senders** and 50 **recipients**, with `google_sub` prefixed `loadtest-`, onboarding complete, and preferred service Spotify.
- One accepted `friends` row per sender–recipient pair.
- Sessions are minted with `signSessionToken`'s format (HS256, `sub` = user id), signed with a throwaway `JWT_SECRET` that the script generates for each run and passes to the container. No Google sign-in is involved.

Sender `i` sends in every round where `i < N`, so sender 1 sends five times in the run. That stays under the conversion limit of 10 per user per 10 minutes, and the whole run stays under the global limit of 300 requests per minute per IP. No limit is changed or bypassed for the test.

## 4. How a run works

### 4.1 Setup (about 1 minute)

1. Check that Docker is running. If it isn't, stop and ask the developer to start Docker Desktop.
2. Build the backend image (`docker build backend`) and tag it `bookrough-backend:loadtest`.
3. Recreate `music_app_loadtest_db` in the compose Postgres.
4. Start the container with `--memory=2g --cpus=1`, `NODE_ENV=production`, the throwaway secret and the load-test `DATABASE_URL`. Migrations run on start, as in production.
5. Wait for `GET /api/health` to report healthy (maximum 60 s).
6. Seed the users and friendships, and mint 50 session cookies.
7. Take the links from `mock-data/songs.json`: 84 real Apple Music links (78 tracks, 6 albums). Each round takes the next links in the pool, so links are distinct within a round. A full run needs 150, so later rounds repeat links an earlier round sent. Every request records whether its link is a repeat, and the report counts them per round, because squigly.link may answer a repeated link faster (§9).

### 4.2 One round (N = 10, 20, 30, 40, 50)

- Request _k_ (0 … N−1) is sent at `k × 5000 / N` ms after the round starts, so the N requests are spread evenly over 5 s. Each request comes from its own sender, to its own recipient.
- Each request has a client-side timeout of **30 s**. The server should answer within 12 s, so 30 s leaves room to see how late a late answer is, instead of cutting it off.
- The round ends when every request has been answered or has timed out.
- **Cool-down:** after the round, the script waits until `docker stats` shows no Chromium process and memory has settled, and at least 20 s. Then the next round starts, so one round's queue doesn't spill into the next.

### 4.3 What is recorded

| Source                              | Recorded                                                                                                          | How often            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| Each request                        | sent time, answered time, latency, HTTP status, outcome (`converted` / `pending` / error), error text             | per request          |
| The database, after each round      | that each `201` has its `posts` row, and that the number of rows equals the number of `201`s                      | per round            |
| `docker stats`                      | container memory and CPU                                                                                          | every 1 s            |
| `GET /api/health`, sent in parallel | latency and status: is the server still responsive while the queue is full?                                       | every 1 s            |
| Container logs (Pino JSON)          | `durationMs` and `outcome`/`reason` from `Link converted` / `Link conversion unavailable`; any `error`-level line | collected at the end |
| `docker inspect`                    | `OOMKilled`, restart count, exit code                                                                             | after each round     |

### 4.4 What counts as a failure

| Failure                                                                  | Detected by               |
| ------------------------------------------------------------------------ | ------------------------- |
| HTTP 5xx                                                                 | status code               |
| HTTP 429 (a rate limit hit when it shouldn't be)                         | status code               |
| A dropped connection or a refused connection                             | `fetch` throws            |
| No answer within 30 s                                                    | client timeout            |
| **The ceiling is broken**: an answer later than 12 s + 1 s margin        | latency                   |
| **A lost post**: a `201` without a row, or a 5xx after a row was written | the database check        |
| The container is killed (out of memory) or restarts                      | `docker inspect`          |
| Health checks failing or slower than 2 s during a burst                  | the parallel health probe |
| An `error`-level log line                                                | container logs            |

A `conversion_pending` post is **not** a failure. It is the designed result when the queue is full (§7). The report counts it separately.

### 4.5 Teardown

The script stops and removes the container, and drops `music_app_loadtest_db`, even when the run fails partway. A `finally` block and a Ctrl+C handler both run the teardown. The dev database is never touched.

## 5. The report

The output goes to `backend/scripts/load-test/out/<timestamp>/`, which is git-ignored:

- **`report.html`**: one self-contained file, with inline SVG charts, no CDN and no scripts. It opens straight from disk and in the browser pane.
- **`results.json`**: every raw measurement, so a later run can be compared with this one.

`report.html` contains, in order:

1. **Verdict**: one line per round, _passed_ or _failed_, and why.
2. **Summary table**, one row per round: N; answered; `converted`; `pending`; failures; latency p50 / p95 / max; peak memory; slowest health check.
3. **Timeline per round**: each request as a horizontal bar from send to answer, coloured by outcome, with the 12 s ceiling drawn as a line. This shows the queue: two bars at a time convert, and the rest wait and end as `pending` at about 10–12 s.
4. **Latency by round**: p50, p95 and max as N grows.
5. **Memory and CPU over the whole run**, with the rounds marked, against the 2 GB limit.
6. **Conversion rate by round**: the share of `converted` posts as N grows.
7. **Failures**: every one listed with its round, request, time and error text. If there were none, the report says so.
8. **Environment**: commit hash, image, limits, date, Node and Chromium versions, and the number of real squigly.link requests.

### Expected result (the hypothesis the run checks)

From reading the code: every request is answered within 12 s, with no failures and no lost posts. Roughly 5–7 posts per round convert, whatever N is, because two Chromium slots × about 10 usable seconds ÷ about 3 s per conversion is the queue's capacity. Every other post is saved as `pending`. Peak memory is about 330 MB, the same as with 5 posts, because Chromium never runs more than twice at once. If the run shows otherwise, that is the finding.

## 6. Edge cases & failure modes

- **squigly.link is slow or down during the run.** Every post comes back `pending` with reason `timeout` or `unavailable`. The report shows the reasons from the logs, so an outage can't be mistaken for a capacity limit. The developer can run the test again later.
- **The squigly.link page changes and the selectors break.** Every conversion fails fast. The report shows the same thing, with the reasons.
- **Load on a third party.** Because of `p-limit(2)`, at most two requests reach squigly.link at once. A request that waits more than 10 s never opens a page. The estimate is about 25–35 real conversions per run, at the rate of two friends posting. The test is run by hand, a few times, never on a schedule.
- **Docker isn't running, or port 3000 / the database name is taken.** The script stops before seeding, with a clear message.
- **The machine itself is busy.** Local results depend on the PC. The report records the environment, and the `--cpus=1` limit keeps the container close to the production instance.
- **The run is interrupted (Ctrl+C or a crash).** The teardown still runs, and the partial results are written to the report, marked _incomplete_.

## 7. Test scenarios

The script is a tool, not app code, so it is tested where it can be wrong without Docker.

**Unit (`backend/scripts/load-test/*.test.ts`)**

- ✅ The schedule spreads N requests evenly over 5 s, for N = 10 and N = 50.
- ✅ p50, p95 and max are computed correctly for a known list. An empty list gives no figures, not `NaN`.
- ✅ The classification turns a `201` with `conversionPending: false` into `converted`, `true` into `pending`, a 5xx into a failure, a 429 into a failure, a thrown `fetch` into a failure, and an answer at 13.5 s into a ceiling breach.
- ✅ A round with no failures gets _passed_. One failure of any kind gets _failed_, with that reason.
- ✅ The report renders from a fixed `results.json`: summary rows, one bar per request, and the failures section.
- ❌ An interrupted run renders as _incomplete_, without throwing.
- ❌ A seed or teardown run against a database name that is not `music_app_loadtest_db` is refused.

**Integration / E2E**: none. The run itself is the integration test, and it doesn't belong in CI (§2).

## 8. Open questions

None. Approved by the developer on 2026-11-23: the local image at 2 GB / 1 vCPU, and real squigly.link requests.

## 9. Decisions log

| Date       | Decision                                                                                                                                       | Reason                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-23 | Links come from `mock-data/songs.json` (84 Apple Music links) and repeat across rounds, with each repeat marked in the results and the report. | Only these links are known to be real. Inventing links would turn requests into 422s, not conversions. Found in the Stage 3 review. |
| 2026-11-23 | Server log times are shifted by the container's clock offset, measured once at start.                                                          | Docker Desktop's VM clock can drift from the host's, which would put a log line in the wrong round. Found in the Stage 3 review.    |
