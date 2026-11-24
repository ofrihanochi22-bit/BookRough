# Feature: Automatic conversion retry and a whole-request ceiling

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-11, UC-20 (amended)                                             |
| **Phase**     | 6 (a fix to Step 3, after the load test, Step 6.1z15)              |
| **Branch**    | `feat/conversion-auto-retry`                                       |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged |

---

## 1. Goal

When the server is busy, a shared song is still converted: the sender's app tries again on its own, a few times over about 8 minutes, instead of leaving the post with its original link for good. A send that arrives while the converter's queue is already full is saved at once with a "server is busy" notice instead of a 12-second spinner that ends in nothing. Every send and retry answers within the 12-second ceiling, measured over the whole request.

### 1.1 Why this came up (load test, 2026-11-24)

The burst load test (docs/features/load-test.md §5, "First run") sent 10 to 50 direct recommendations within 5 seconds against the production image at 2 GB / 1 vCPU:

- **Conversions:** 8 of 10 converted, but only 2–4 per round from 20 requests upward. Every other post was saved pending with reason `timeout`. Two Chromium slots (`p-limit(2)`) on one vCPU take 9–12 s per conversion, so each slot fits about one conversion before the ceiling.
- **The ceiling:** 10 of 150 answers took 13.0–13.3 s. `CONVERSION_CEILING_MS` starts when `convertLink` is called. The work before it (session, validation, the friendship or membership check) and the post's write after it add up to 1.3 s on a busy CPU.
- **What held:** no post was lost, there were no 5xx and no out-of-memory kill, and memory stayed under 370 MB.

## 2. Scope

**In scope**

- **All posts:** community posts (UC-11) and direct recommendations (UC-20) alike (developer's choice).
- **Busy at send time:** when the converter's queue is already full, the server skips the conversion and saves the post pending at once (developer's choice).
- **Automatic retries, sender only** (developer's choice): while the sender's app is open, it retries their own pending posts 4 times, 15 s, 45 s, 2 min and 5 min after the post was saved (developer's choice).
- **A per-post cap on the server** (developer's choice): at most 4 automatic attempts per post, counted in a new column. Automatic attempts don't count toward the user's `conversion` rate-limit tier.
- **A whole-request ceiling:** sending, posting and retrying answer within 12 s of the request reaching the controller.
- **A "still looking" notice** for every viewer of a pending post that still has automatic attempts left. Other viewers see the converted post on their next load (developer's choice).

**Out of scope**

- **No live update for viewers:** no polling, no push, no notification when a post converts (developer's choice).
- **No retries from other viewers:** a viewer other than the sender never retries automatically. The manual **Try again** (conversion-retry.md) is unchanged: anyone who can see the post, counted in the `conversion` tier.
- **No server-side queue or background job:** CLAUDE.md §7's synchronous posting flow stands, and the post is still born at once. Nothing runs after the response is sent.
- **No change to the queue's size:** `MAX_CONCURRENT_CONVERSIONS` stays 2. The load test showed the CPU, not memory, is the limit.
- **No retry for links that can't convert:** a link-only post, or a post squigly answered "could not be found" for, is never pending in the first place.
- **Offline:** no attempt while offline (CLAUDE.md §16: offline write is not supported). An attempt that comes due offline waits until the app is back online.
- **Visual design** beyond the simplest placeholder (memory: defer visual design).

## 3. Data model changes

One column on `posts`:

| Column             | Type      | Null | Default | Notes                                                                   |
| ------------------ | --------- | ---- | ------- | ----------------------------------------------------------------------- |
| `auto_retry_count` | `INTEGER` | no   | `0`     | Automatic attempts used, 0–4. Prisma: `autoRetryCount Int @default(0)`. |

- The hand-written CHECK `posts_auto_retry_count_range` (`auto_retry_count BETWEEN 0 AND 4`), invisible to Prisma like the other CHECKs on `posts` (CLAUDE.md §6).
- Migration: `npx prisma migrate dev --name add_post_auto_retry_count`, with the CHECK added by hand to its SQL.
- Existing rows get 0. A post that is already pending in production gets 4 automatic attempts the next time its sender's app shows it (§6).
- `docs/tables.md` and `docs/tables.docx` both gain the column and the CHECK (CLAUDE.md §14.1), and CLAUDE.md §6 gains one line.

## 4. API

### 4.1 Busy detection (in `linkScraper.service.ts`)

- `convertLink(url, sourceService, deadline)` takes the request's deadline instead of starting its own 12 s clock.
- **Busy rule:** when the call arrives and `BUSY_QUEUE_LENGTH` conversions are already waiting behind the 2 running (2 to start, one constant, tuned by re-running the load test), it returns `{ outcome: 'unavailable', reason: 'busy' }` at once. No queueing and no browser. It is logged like the other outcomes, as `reason: 'busy'`.
- **Time left:** an attempt that leaves the queue with less than `MIN_ATTEMPT_MS` before `deadline − WRITE_RESERVE_MS` isn't started (unchanged in spirit). The ceiling timer fires at `deadline − WRITE_RESERVE_MS`.
- **Counted on arrival** (found in Stage 4): the waiting conversions are counted synchronously as each call arrives, not read from `limit.pendingCount`, which `p-limit` fills a microtask later, so calls arriving in the same tick would all see an empty queue.
- **`WRITE_RESERVE_MS`:** 1.5 s, kept for the work after the conversion (the post's write, notifications, the response). It covers the 1.3 s measured.

### 4.2 The request deadline

- Each controller that converts (`createPost`, the recommendation `send`, `retry`) takes `startedAt = Date.now()` as its first line and passes `deadline = startedAt + CONVERSION_CEILING_MS` to the service. CLAUDE.md §4: the service never sees `req`.
- `prepareSharedLink`, `youtubeVideo` and `retryConversion` use that one deadline. They no longer compute their own.

### 4.3 `POST /api/communities/:id/posts` and `POST /api/recommendations` (changed)

- Behaviour is unchanged, except that a busy queue saves the post pending at once (§4.1). Both answer within 12 s of the controller.
- `PublicPost` gains `autoRetriesLeft: number` (`4 − auto_retry_count`), serialised for every viewer. It is meaningful only while `conversionPending` is true, and 0 on a link-only or converted post.

### 4.4 `POST /api/posts/:postId/conversion` (changed)

- **Request:** an optional body `{ automatic?: boolean }` (Zod, strict; default `false`).
- **`automatic: false`** (the manual Try again): unchanged. Anyone who can see the post may retry, and the request counts in the `conversion` tier. It doesn't touch `auto_retry_count`.
- **`automatic: true`:**
  - **Who:** only the post's author.
  - **Rate limit:** skips the `conversion` tier (the limiter's `skip` reads the validated flag). The global tier still applies.
  - **Order:** check access, then check that the post is still pending, then claim an attempt.
  - **Claiming an attempt:** one conditional update, `UPDATE posts SET auto_retry_count = auto_retry_count + 1 WHERE id = $1 AND conversion_pending AND auto_retry_count < 4`, through Prisma's `updateMany` with `count`. If the claim fails while the post is still pending, the cap is reached. A claimed attempt counts even if it ends `busy`, so 4 is a hard ceiling on conversions per post.
  - **Single-flight:** an in-memory set of post ids with an automatic attempt in flight, per instance. A second automatic request for the same post while one runs answers `409` without claiming an attempt (§6).
- **Success:** `200` `{ post: PublicPost }`, converted or still pending, with `autoRetriesLeft` updated.
- **Errors:**
  - `422` a malformed body (unknown key, `automatic` not a boolean), like every body the project validates (`parseBody`). Unparseable JSON stays a `400`.
  - `401` not signed in.
  - `403` `automatic: true` from anyone but the author, who can see the post. Message: "Only the sender's app retries automatically."
  - `404` no such post, a malformed id, or a post the caller can't see (unchanged).
  - `409` already converted or link-only (unchanged), or an automatic attempt already in flight for this post.
  - `429` the `conversion` tier (manual only, unchanged), or no automatic attempts left. Message for the latter: "No automatic attempts left for this post."

## 5. Screens & components

Every screen that shows a `PostCard` or `SavedPostCard` (Community Feed, Post Detail, Recommendations, My List) is affected. Nothing changes in the layout at 375 px beyond the notice text.

### 5.1 The automatic-retry runner (new, `frontend/src/lib/` + a Zustand store)

- **App-level:** one runner for the whole app, not one per card, so attempts continue on any screen while the app is open. It holds a map of post id to `{ savedAt, autoRetriesLeft }`.
- **Registering a post:** a post is registered when the signed-in user is its author, `conversionPending` is true and `autoRetriesLeft > 0`. That happens when:
  - their own send or post returns, or
  - any list returns one of their own posts, so an attempt resumes after the app was closed and reopened.
- **Timing:** the next attempt is due at `savedAt + [15 s, 45 s, 2 min, 5 min][4 − autoRetriesLeft]`, plus up to 3 s of random jitter. An attempt already overdue runs at once.
- **Order and pausing:** at most one of the sender's attempts runs at a time, in due order. Attempts pause while `navigator.onLine` is false and while the page is hidden, and resume on `online` or `visibilitychange`.
- **Results:**
  - **Converted:** the post leaves the map, and the store hands the updated post to any card showing it (the existing `onUpdated` path).
  - **Still pending with attempts left:** reschedule. With none left, the post leaves the map.
  - **`409` or `404`:** the post leaves the map (stale or deleted). **`429`:** the post leaves the map.
  - **No answer or a `5xx`:** it counts as that slot being spent on the client side only, and the next slot is scheduled. The server's count is the truth on the next load.
- **No toast:** automatic requests skip the global error toast. The card's line is the only feedback.

### 5.2 The notice on a pending card

| State                                                                     | Line                                                                                                  | Try again button |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| Pending, `autoRetriesLeft > 0`, saved less than 10 min ago (every viewer) | "The server is busy. Still looking for this on other services…" (`STILL_LOOKING_NOTICE`)              | shown            |
| Pending otherwise                                                         | the existing `PENDING_NOTICE`                                                                         | shown            |
| After a manual retry                                                      | the existing notices (`STILL_PENDING_NOTICE`, `RETRY_FAILED_NOTICE`, `RETRY_ERROR_NOTICE`), unchanged | shown            |

- **The sender's submit:** at submit time, a send that comes back pending shows the post at once with `STILL_LOOKING_NOTICE`. That covers both a busy queue and a timeout, since the sender can't tell them apart. The Public Profile ratings row keeps `PENDING_SHORT_NOTICE`.
- **Loading:** none new. The runner works in the background, and the card shows no spinner for an automatic attempt.
- **Empty state:** none new.
- **Error state:** the runner never surfaces an error. Once the attempts are spent, the card falls back to `PENDING_NOTICE` and Try again.

## 6. Edge cases & failure modes

- **The sender closes the app:**
  - With a post still pending, attempts stop.
  - When they reopen it and a list returns that post, the runner resumes with the server's `autoRetriesLeft`. Any attempt now overdue runs at once, and the rest keep the schedule's spacing from that moment.
  - If they never return, the post stays pending with the manual Try again.
- **Two of the sender's devices:** both may run an attempt for the same post at the same moment. The single-flight set answers `409` to the second on the same instance. On two instances, both may run: each claimed a slot, so the cap of 4 still holds.
- **A manual and an automatic retry at the same moment:** both may run. The conditional write (conversion-retry.md) writes once, and the cap still bounds the automatic ones.
- **A post converted by someone's manual Try again:** the sender's next automatic attempt gets `409`, and the runner drops the post.
- **The post is deleted, the sender leaves the community, or the friendship ends:**
  - **Deleted:** `404`.
  - **Left the community:** `404` under the existing access rule (a former member can't see it).
  - **Friendship ended:** the existing rule, where the sender of a direct item still sees it after unfriending.
  - In every `404` case the runner drops the post.
- **A busy answer on an automatic attempt:** it spends the slot. That is intended: 4 slots × the schedule's spacing ride out a burst like the load test's, and a longer outage leaves the manual Try again.
- **An already-pending post in production:** `auto_retry_count` is 0, so the next time its sender sees it, it gets up to 4 attempts. The first is overdue, so it runs at once.
- **Clock skew between the phone and the server:** `savedAt` is the server's `createdAt`. A phone clock that runs ahead makes attempts overdue sooner, never later, and only by the skew.
- **A malicious client:**
  - It can spend a post's 4 automatic slots at once. That costs at most 4 conversions per post.
  - Creating posts is limited by the `conversion` tier, which bounds the total.
  - Automatic requests for someone else's post are a `403`.
- **The ceiling:** a request whose controller started 12 s ago always has an answer. When the conversion is cut short, the 1.5 s reserve is what the write uses. An answer that still exceeds 12 s on a slow database is a finding for the next load test, not a crash.

## 7. Test scenarios

**Unit (services)**

- ✅ `convertLink` returns `busy` at once, launching no browser, when `BUSY_QUEUE_LENGTH` conversions are already waiting, including calls made in the same tick.
- ✅ `convertLink` queues normally below the busy threshold.
- ✅ `convertLink`'s ceiling fires at `deadline − WRITE_RESERVE_MS` and closes what it opened.
- ❌ `convertLink` doesn't start an attempt that leaves the queue with less than `MIN_ATTEMPT_MS` left before the reserve.
- ✅ `prepareSharedLink` passes the caller's deadline through, so a slow membership check shortens the conversion's budget.
- ✅ `retryConversion` automatic: the author claims an attempt, it converts, and `autoRetriesLeft` drops by one.
- ✅ `retryConversion` automatic: still pending after the attempt, with the count increased.
- ✅ `retryConversion` automatic: a `busy` result still spends the slot.
- ❌ `retryConversion` automatic: not the author → `AppError` 403.
- ❌ `retryConversion` automatic: no attempts left → `AppError` 429.
- ❌ `retryConversion` automatic: already in flight for this post → `AppError` 409, with no slot claimed.
- ❌ `retryConversion` automatic: already converted → 409, and link-only → 409.
- ✅ `retryConversion` manual: leaves `auto_retry_count` unchanged.
- ✅ `toPublicPost` serialises `autoRetriesLeft` as `4 − autoRetryCount`, and 0 for a converted or link-only post.

**Integration (endpoints)**

- ✅ `POST /recommendations` with the converter busy → `201`, pending, answered well under the ceiling.
- ✅ `POST /communities/:id/posts` with the converter busy → `201`, pending.
- ✅ `POST /posts/:id/conversion {automatic:true}` by the author → `200`, converted.
- ✅ The same, still pending → `200` with `autoRetriesLeft` decreased.
- ✅ Automatic requests don't count in the `conversion` tier: 11 automatic attempts across 3 posts by one user, none `429` for the tier.
- ❌ `422`: `{automatic: "yes"}` and `{automatic: true, extra: 1}`.
- ❌ `401`: no session.
- ❌ `403`: `{automatic:true}` from a community member who isn't the author.
- ❌ `403`: `{automatic:true}` from the recipient of a direct item.
- ❌ `404`: another community's post, and a missing post.
- ❌ `409`: an already-converted post with `{automatic:true}`.
- ❌ `429`: a fifth automatic attempt on one post.
- ❌ DB: the CHECK `posts_auto_retry_count_range` refuses 5 and −1 when written directly.

**Component**

- ✅ `PostCard`: a pending post with attempts left, saved 2 min ago, shows `STILL_LOOKING_NOTICE` and Try again.
- ✅ `PostCard`: a pending post with none left, or saved 20 min ago, shows `PENDING_NOTICE`.
- ✅ The runner (fake timers): it registers the author's pending post, fires at 15 s with `{automatic:true}`, and on converted updates the card and stops.
- ✅ The runner: still pending → fires again at 45 s, then 2 min, then 5 min, then stops.
- ✅ The runner: resumes from `autoRetriesLeft` (2 left → the next is the 2-min slot) and runs an overdue attempt at once.
- ❌ The runner: never registers someone else's post.
- ❌ The runner: pauses while offline and fires on `online`.
- ❌ The runner: drops the post on `409`, `404` and `429`, with no toast.
- ❌ The runner: on a network error, schedules the next slot.

**E2E**

- None new. The golden loop already posts a link, and this needs a busy real converter, which the E2E stand-in can't produce (load-test.md §2).

**Load test (by hand, after implementation)**

- Re-run `npm run load-test`: every answer under 12 s, and no round fails on the ceiling. Then tune `BUSY_QUEUE_LENGTH` from the result. The load test doesn't run the client-side runner, so the conversion rate it reports is the send-time rate only.

### 7.1 Load test re-run (2026-11-24, local image at 2 GB / 1 vCPU)

`npm run load-test`, the same rounds as load-test.md §5, with this feature and `BUSY_QUEUE_LENGTH = 2`:

| Round | Converted | Pending: busy | Pending: timeout | p50   | p95    | Max    | Peak memory | Worst health |
| ----- | --------- | ------------- | ---------------- | ----- | ------ | ------ | ----------- | ------------ |
| 10    | 2         | 6             | 2                | 1.3 s | 10.8 s | 10.8 s | 324 MB      | 194 ms       |
| 20    | 2         | 16            | 2                | 0.5 s | 10.8 s | 11.0 s | 335 MB      | 78 ms        |
| 30    | 2         | 26            | 2                | 0.4 s | 10.6 s | 10.8 s | 349 MB      | 341 ms       |
| 40    | 2         | 36            | 2                | 0.5 s | 9.2 s  | 9.4 s  | 352 MB      | 207 ms       |
| 50    | 2         | 46            | 2                | 0.6 s | 8.5 s  | 10.9 s | 352 MB      | 173 ms       |

Verdict: **PASSED.** Every answer came within 12 s (the slowest took 11.0 s, against 13.3 s before). All 150 posts are in the database, and there were no 5xx, 429, network errors, error-level log lines, out-of-memory kills or restarts. A post saved busy answers in about half a second instead of about 12 s.

What it shows:

1. **The ceiling holds.** The deadline and the write reserve fixed the 13 s answers.
2. **Two conversions per round.** squigly took 7.3–9.4 s per conversion on this run, against 3.8–12 s on the first run. With the attempt cutoff at 8.5 s (12 − 1.5 − 2), a waiting attempt never got a slot in time. So the 2 waiting per round ended `timeout`, and the rest were `busy` at once. The load test doesn't run the app's automatic attempts, which are what convert these posts afterwards (§5.1).
3. **`BUSY_QUEUE_LENGTH` stays 2.** On this run the 2 waiting attempts converted nothing, but on the first run, when squigly was faster, waiting attempts did convert (8 of 10 in the first round). A queue of 0 would refuse those too. One run at a slow moment isn't enough to change the constant: the cost of keeping 2 is at most 2 requests that wait about 10 s before being saved pending.

## 8. Open questions

None. Approved by the developer on 2026-11-24; every decision is recorded in §9.

## 9. Decisions log

| Date       | Decision                                                                                 | Why                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-24 | The ceiling fix and automatic retry are one feature                                      | Saving at once when busy fixes most of the ceiling breaches; one spec, one PR.                                                   |
| 2026-11-24 | All posts, not only direct recommendations                                               | The same converter and queue; the manual Try again already covers both.                                                          |
| 2026-11-24 | Only the sender's app retries automatically                                              | Developer's choice. Viewers keep the manual Try again.                                                                           |
| 2026-11-24 | 4 attempts: 15 s, 45 s, 2 min, 5 min                                                     | Rides out a burst like the load test's within minutes; bounds CPU use (Fluid Active CPU at 40.8% on 2026-11-24).                 |
| 2026-11-24 | Busy at send time → save pending at once                                                 | Nobody waits 12 s for a conversion that has no slot; the queue doesn't fill with doomed attempts.                                |
| 2026-11-24 | A per-post cap of 4 on the server, a new column; automatic attempts skip the user's tier | A client can't exceed 4 conversions per post; three busy sends don't hit the tier's 10 per 10 min. Accepted cost: one migration. |
| 2026-11-24 | Other viewers see the conversion on their next load                                      | No polling: no extra requests per viewer, fewer screens touched. Amends conversion-retry.md §2's "no automatic retries".         |
