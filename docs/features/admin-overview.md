# Feature: Admin Overview — storage and app health on one page

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-19 amended (the administrator watches the application's health) |
| **Phase**     | 6 — Step 6.1z of `DEVELOPMENT.md`                                  |
| **Branch**    | `feat/admin-overview`                                              |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged |

---

## 1. Goal

On 2026-10-12 the Vercel team was paused for 30 days because Images Storage went over its 10 GB Hobby limit. Since then, three tools watch for a repeat: the `/vercel-usage` skill reads the Usage meters, the `prune-deployments` CI job deletes old deployments, and the `/vercel-image-cleanup` skill deletes unused registry images. Each prints its result in a terminal or a job log and then forgets it. After this ships, the admin opens **Admin → Overview** in the app and sees, on one page:

- where each storage limit that could block the app stands;
- which deployments and images exist, and when each kind was last deleted;
- how the app itself is used.

Every block says where its data came from and how old it is. The page is read-only; its one control is **Refresh**.

### 1.1 Decisions from the Stage 1 session (2026-11-17)

| #   | Question                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Where the Vercel data comes from | **Snapshots written by the tools that already read it.** The two skills post their reading through the developer's signed-in admin session in Chrome, so they need no new secret. `prune-deployments` posts with a dedicated, write-only ingest token. The server never calls Vercel and holds no Vercel token. Live calls were rejected: a Vercel token always has full rights, and live calls would break §16. |
| Q2  | Site visits                      | **An anonymous daily count of app opens**, split signed in / signed out. One row per day, with no user id, IP, cookie or device id. It counts opens, not unique visitors.                                                                                                                                                                                                                                        |
| Q3  | Placement and UC                 | **A first tab, "Overview", in the Admin screen.** `/admin` lands on it. Recorded as an amendment to UC-19, with no new UC number and no new screen.                                                                                                                                                                                                                                                              |
| Q4  | History                          | **Snapshots are kept for 90 days.** This gives a change since the previous reading and a "last deletion" that survives runs that delete nothing.                                                                                                                                                                                                                                                                 |
| —   | Staleness (default, unopposed)   | Every block shows its source and age. A snapshot older than **48 hours** is marked **Stale**. Postgres figures are marked **Live**.                                                                                                                                                                                                                                                                              |
| Q5  | Neon                             | **Yes, live.** The database's own size, compared with the Free plan limit.                                                                                                                                                                                                                                                                                                                                       |

## 2. Scope

**In scope**

- Migration `add_ops_overview`: tables `ops_snapshots` and `daily_app_opens` (§3).
- `GET /api/admin/overview`, which serves the whole page in one call.
- Two ingest endpoints. `POST /api/admin/ops/snapshots` takes an admin session and is used by the skills. `POST /api/ops/snapshots` takes the ingest token and is used by CI.
- Counting app opens on the start-up `GET /api/settings?open=1`.
- The **Overview** tab with six blocks and Refresh (§5).
- Changes to the three tools:
  - `collect-usage.js` also returns bytes.
  - Both `SKILL.md` files gain a "post the reading" step.
  - `pruneDeployments.ts` posts its plan and its deletions.
  - `main.yml` passes the token to the job.
- Docs:
  - this spec;
  - an amendment note in `admin-panel.md`;
  - `use cases`, `frontend screens`, `tables` and `deployment` (`.md` and `.docx`);
  - CLAUDE.md §6 (sixteen tables), §9 and §17;
  - `backend/.env.example`;
  - `DEVELOPMENT.md`.

**Out of scope** — explicitly

- **Any action from the dashboard.** No delete, prune, promote, "run cleanup" or "scrape now". Refresh re-reads what is stored. It never triggers a scrape, a CI run or a call to Vercel.
- **The server calling Vercel or Neon APIs.** It has no Vercel token and no Neon API key. Database size comes from Postgres itself.
- **Unique visitors, sessions, referrers, pages viewed, devices, countries, "last active", "who opened today".** Anything that needs an identifier per person is out (CLAUDE.md §5; `admin-panel.md` §2 already rejected "last active").
- **Vercel Web Analytics** or any third-party analytics script (§16, provider-agnostic).
- **Alerts or notifications** (email, push, in-app) when a meter climbs. The page shows the status. `/vercel-usage` stays the gate before a merge.
- **Charts and trends.** v1 shows the latest reading and its change since the previous one. The 90-day history allows a chart later without a schema change.
- **Every Usage meter.** Only the three storage meters, plus any other meter at 60% or more, plus the fullest other meter: the same set `/vercel-usage` reports.
- **Preview deployments in their own block.** They appear in the deployment list only if `prune-deployments` sees them, and it lists production only.
- **Editing or deleting snapshots through the app.** Rows are inserted, then deleted only when they are older than 90 days.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_ops_overview`. With these two tables the schema has **sixteen tables**.

### 3.1 Enum `OpsSource`

`VERCEL_USAGE` (from `/vercel-usage`), `IMAGE_CLEANUP` (from `/vercel-image-cleanup`), `PRUNE_DEPLOYMENTS` (from the CI job).

### 3.2 Table `ops_snapshots`

One row per tool run. Inserted, never updated.

| Column          | Type          | Notes                                                                                                                      |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `UUID`        | Primary key.                                                                                                               |
| `source`        | `OpsSource`   | Which tool wrote it.                                                                                                       |
| `captured_at`   | `TIMESTAMPTZ` | When the tool read the data, sent by the tool. Must be no more than 7 days old and no more than 5 minutes in the future.   |
| `received_at`   | `TIMESTAMPTZ` | Default `now()`. Used for retention.                                                                                       |
| `payload`       | `JSONB`       | Validated against the source's Zod schema (§4.4) on write, and again on read.                                              |
| `deleted_count` | `INT`         | Default 0. The number of items the run deleted, copied from the payload on write, so "last deletion" is one indexed query. |
| `written_by_id` | `UUID`, null  | FK → `users(id)`, `ON DELETE SET NULL`. The admin whose session posted it; `null` for CI.                                  |

Indexes: `(source, captured_at DESC)`; `(source, deleted_count, captured_at DESC)`.

**Retention:** every insert also deletes rows whose `received_at` is older than 90 days, in the same transaction.

**Hand-written CHECK** `ops_snapshots_deleted_nonneg` (`deleted_count >= 0`) in this migration. Prisma can't see it (CLAUDE.md §6).

### 3.3 Table `daily_app_opens`

One row per UTC day. No column refers to a person.

| Column       | Type   | Notes                                         |
| ------------ | ------ | --------------------------------------------- |
| `day`        | `DATE` | Primary key, UTC.                             |
| `signed_in`  | `INT`  | Default 0. Opens with a valid session.        |
| `signed_out` | `INT`  | Default 0. Opens without a session (Welcome). |

**Hand-written CHECK** `daily_app_opens_nonneg` (both counts `>= 0`), invisible to Prisma.

Rows are kept indefinitely: 365 rows a year, with nothing personal in them.

## 4. API

### 4.1 `GET /api/admin/overview`

- **Auth:** admin (`requireAuth`, `requireAppAdmin`), the same as every `/api/admin/*` route.
- **Request:** none.
- **Success `200`:**

```ts
{
  generatedAt: string,                 // server time of this answer
  app: {                               // source "live"
    users: { total: number, onboarded: number },
    communities: number,
    posts: { community: number, direct: number },
    ratings: number,
    comments: number,                  // not soft-deleted
    opens: {
      today: { signedIn: number, signedOut: number },   // UTC day
      last7Days: { signedIn: number, signedOut: number },
      last30Days: { signedIn: number, signedOut: number },
      countingSince: string | null,    // earliest day row
    },
  },
  database: {                          // source "live"
    usedBytes: number,                 // pg_database_size(current_database())
    limitBytes: number,                // DB_STORAGE_LIMIT_MB (§4.6)
    pct: number,
    status: 'ok' | 'watch' | 'stop',
  },
  vercel: {
    usage: null | {                    // latest VERCEL_USAGE snapshot
      capturedAt, stale: boolean, period: string | null,
      storage: Record<'functions' | 'images' | 'deployment', {
        usedBytes: number, limitBytes: number, pct: number,
        status: 'ok' | 'watch' | 'stop',
        changeBytes: number | null,    // vs the previous VERCEL_USAGE snapshot
      }>,
      others: { name: string, pct: number, status }[],   // ≥ 60%, fullest first
      highestOther: { name: string, pct: number } | null,
    },
    deployments: null | {              // latest PRUNE_DEPLOYMENTS snapshot
      capturedAt, stale, dryRun: boolean, liveId: string,
      items: { id, sha: string | null, createdAt, state, verdict,
               imageSizeBytes: number | null }[],         // joined from the latest images snapshot by tag
    },
    images: null | {                   // latest IMAGE_CLEANUP snapshot
      capturedAt, stale,
      items: { tags: string[], digest: string, sizeBytes: number,
               publishedAt: string | null, inUse: boolean }[],
      totalBytes: number,
    },
    lastDeletion: {
      deployments: { at: string, count: number } | null,  // latest PRUNE_DEPLOYMENTS with deleted_count > 0
      images: { at: string, count: number } | null,       // latest IMAGE_CLEANUP with deleted_count > 0
    },
  },
}
```

- **Rules:**
  - **Status thresholds** are the same as `/vercel-usage`, computed on the server: under 60% `ok`, 60% to under 80% `watch`, 80% or more `stop`.
  - **`stale`** is `capturedAt` older than 48 hours.
  - **`inUse`**: an image is in use when one of its tags is a prefix of the SHA of a deployment in the latest deployments snapshot.
  - **A stored payload the current schema rejects** (an older shape, say) is skipped with a `WARN`. The next older valid one is used, or `null` if there is none. The page never breaks over one bad row.
- **Errors:** `401` no session; `403` not an admin, or not onboarded. A database failure is the usual `500`.
- Serialised field by field. `written_by_id` is never sent, and no user's name or id appears anywhere in the answer.

### 4.2 `POST /api/admin/ops/snapshots` — the skills

- **Auth:** admin session. The skill runs `fetch` inside a `https://bookrough.vercel.app` tab in the developer's Chrome, where the developer is signed in as admin, so the `HttpOnly` cookie goes with the request. Same origin, so CORS is not involved.
- **Request:** a strict object `{ source: 'VERCEL_USAGE' | 'IMAGE_CLEANUP', capturedAt: ISO string, payload }`. The payload follows §4.4. `PRUNE_DEPLOYMENTS` is refused here.
- **Behaviour:**
  - validate;
  - in one transaction, insert the row with `written_by_id` set to the admin, and delete rows older than 90 days;
  - log at `INFO` with `userId`, source and `deleted_count`, never the payload.
- **Success `201`:** `{ id, capturedAt }`.
- **Errors:**
  - `400` body is not JSON;
  - `413` over the 100 kb body limit;
  - `422` an unknown source, `PRUNE_DEPLOYMENTS`, a bad `capturedAt` (unreadable, over 7 days old or over 5 minutes ahead), or a payload that breaks §4.4;
  - `401`; `403`.

### 4.3 `POST /api/ops/snapshots` — the CI job

- **Auth:** `Authorization: Bearer <OPS_INGEST_TOKEN>`, no cookie. The guard compares the SHA-256 of the given token with the SHA-256 of the configured one, using `crypto.timingSafeEqual`.
- **Request:** the same shape, with `source: 'PRUNE_DEPLOYMENTS'` only.
- **Behaviour:** the same as §4.2, with `written_by_id: null`.
- **Success `201`:** `{ id, capturedAt }`.
- **Errors:**
  - `404` when `OPS_INGEST_TOKEN` is not set on the server. The endpoint is then off and looks like any unknown path.
  - `401` missing header, wrong scheme, or wrong token. All give the same message, "Invalid ingest token.", and the token is never logged.
  - `400`; `413`; `422`, which includes any source other than `PRUNE_DEPLOYMENTS`, so a leaked token can't forge a storage reading.
- **Rate limit:** the `signIn` tier (per IP, 10 per 15 minutes) in addition to `global`, so guessing the token is slow. A real run posts once.
- Not under `/api/admin`, so the admin guard and its `403` don't apply. The token is the only key.

### 4.4 Payload schemas (Zod, strict, in `services/opsSnapshots.ts`)

Strings are bounded, arrays are capped, and numbers are finite and non-negative.

- **`VERCEL_USAGE`:**

  ```ts
  { period: string ≤ 80 | null,
    storage: { functions, images, deployment: { usedBytes, limitBytes > 0 } },
    others: { name: string ≤ 80, pct: number 0–1000 }[] ≤ 60 }
  ```

  `deleted_count` is always 0. `others` holds every non-storage meter the script read, with its percentage; the server picks the ones at 60% or more and the fullest.

- **`IMAGE_CLEANUP`:**

  ```ts
  { images: { tags: string[] ≤ 20, digest: /^[0-9a-f]{12,64}$/, sizeBytes, publishedAt: ISO | null }[] ≤ 200,
    deleted: { tags: string[] ≤ 20, digest, sizeBytes }[] ≤ 200 }
  ```

  A tag matches `/^[A-Za-z0-9._-]{1,128}$/`. `images` is the table after the run; `deleted` is what this run deleted. `deleted_count = deleted.length`. A run that deleted nothing still posts, with `deleted: []`.

- **`PRUNE_DEPLOYMENTS`:**

  ```ts
  { dryRun: boolean, liveId: string ≤ 64,
    deployments: { id: string ≤ 64, sha: /^[0-9a-f]{7,40}$/ | null, createdAt: ISO, state: string ≤ 20,
                   target: string ≤ 20 | null,
                   verdict: 'keep (live)' | 'keep (rollback)' | 'keep (unfinished)' | 'keep' | 'delete' }[] ≤ 200,
    deleted: { id, sha, createdAt }[] ≤ 10 }
  ```

  `deleted` is empty on a dry run. `deleted_count = deleted.length`.

### 4.5 Counting app opens — `GET /api/settings?open=1`

- The frontend's one start-up fetch of the settings adds `open=1`. Every other settings fetch, such as the re-fetch after an admin saves, doesn't, so it isn't counted.
- With `open=1`, the settings controller calls `recordAppOpen(signedIn)` without waiting for it. `signedIn` means a valid session was present (`optionalAuth`). The service upserts today's row and increments one column.
- A failure is logged at `WARN` and **never** changes the settings response.
- Nothing about the request is stored: not the IP, the user agent or the user id. The `open` parameter takes only `1`; any other value is ignored and nothing is counted.
- The service worker fetches `/api/*` network first, so an online open always reaches the server. An offline open, served from the cache, isn't counted, which is correct.

### 4.6 Configuration

| Variable              | Where                                                         | Notes                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPS_INGEST_TOKEN`    | Vercel env (Production) **and** GitHub secret, the same value | **The developer's** (CLAUDE.md §11). At least 32 characters; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Unset means §4.3 is off (`404`) and the CI job skips posting with a notice.                |
| `OPS_INGEST_URL`      | GitHub variable, not a secret                                 | Defaults to `https://bookrough.vercel.app/api/ops/snapshots`.                                                                                                                                                                                           |
| `DB_STORAGE_LIMIT_MB` | Vercel env, optional                                          | Defaults to **512**, the conservative reading of Neon Free. Neon's own pages disagree, between 0.5 GB and 1 GB per project; the developer confirms the figure in the Neon console (§8). Not a secret. Named after the database, not the provider (§16). |

Validated in `config/env.ts`: the token is at least 32 characters when set, and the limit is a positive integer.

## 5. Screens & components

The **Admin** screen gains a first tab. The tabs become **Overview · Users · Communities · Settings**, and `/admin` redirects to `/admin/overview`. No new screen is added to the catalog, and access is unchanged (`admin-panel.md` §5.1): everyone else gets `NotFound` without an API call, and a `403` mid-session switches to `NotFound`.

Visual design follows the existing Admin tabs (Mixtape). Where it doesn't settle something, the simplest placeholder is used (memory: defer visual design).

### 5.1 Layout at 375px, top to bottom

1. **Header line:** "Updated 14:02", the time of `generatedAt`, and a **Refresh** button (44×44 or larger). Refresh re-fetches `GET /api/admin/overview`. While it runs, the button shows a spinner and the current blocks stay visible. Afterwards the time updates. A screen-reader live region says "Overview updated", or the error.
2. **Storage limits:** one row per meter, with a name, "4.55 GB of 10 GB", a bar, the percentage, a status chip (OK / Watch / Stop) and the change since the previous reading ("+0.4 GB"). Rows:
   - Vercel Images Storage;
   - Vercel Functions Storage;
   - Vercel Deployment Storage;
   - Neon database, with the note "Approximate: measured from inside the database";
   - any other Vercel meter at Watch or Stop.

   A Stop row is listed first.

3. **Deployments:** one row per deployment, with short SHA, "Created 17 Nov, 11:20", state, verdict ("Live", "Rollback", "Building", "Will be deleted", "Deleted" for a dry run's would-delete), and image size if known. A dry-run snapshot shows the note "Dry run: nothing was deleted".
4. **Images:** one row per image, with tags (short SHAs), size, "Published 17 Nov" and "In use" or "Not used by any deployment". The block ends with a total.
5. **Last deletions:** "Deployments: 3 deleted · 17 Nov, 03:10 (prune-deployments)" and "Images: 2 deleted · 16 Nov, 18:40 (/vercel-image-cleanup)". If there is none in 90 days: "None in the last 90 days".
6. **App:** the figures, in a grid of small stats:
   - users, with how many are onboarded;
   - communities;
   - posts (community / direct);
   - ratings;
   - comments;
   - app opens today, last 7 days and last 30 days, each split into signed in and signed out, with the note "Counts app opens, not people. Counting since 17 Nov 2026."

**Source and age line** under each block's heading:

- Postgres blocks: "Live".
- Snapshot blocks: "From /vercel-usage · 3 hours ago", with a **Stale** chip when it is older than 48 hours, plus "Last reading 4 days ago. Run /vercel-usage to update."

The CI source reads "From prune-deployments (CI)".

### 5.2 States

- **Loading** (first load): skeleton blocks.
- **Error:** the standard `LoadError` with **Try again**. A failed Refresh keeps the last data and shows the error inline under the header.
- **Empty per block:** a snapshot block with no snapshot reads "No reading yet. Run /vercel-usage after the next merge." (or the matching tool). Opens with no rows: "No app opens counted yet."
- **Offline:** the service worker may serve the last loaded copy. The header then reads "You're offline. Showing the last loaded copy.", and Refresh is disabled with that reason.

### 5.3 Frontend modules

- `api/admin.ts`: `fetchAdminOverview`.
- `pages/AdminOverview.tsx`: the tab.
- `Admin.tsx`: the tab list and redirect.
- `api/settings.ts`: `fetchPublicSettings({ countOpen: true })` at start-up only.

## 6. The tools that write snapshots

### 6.1 `/vercel-usage`

- **`collect-usage.js`** also returns, for each storage meter, `usedBytes` and `limitBytes`, parsed from "4.55 GB / 10 GB" with decimal units (B, kB, MB, GB, TB, as Vercel shows them). It also returns `others`, with every non-storage meter and its percentage. A value it can't parse is left out, and the skill does not post a reading with a storage meter missing.
- **New step**, after the history file:
  1. Navigate the same tab to `https://bookrough.vercel.app/`.
  2. Run a short `fetch('/api/admin/ops/snapshots', { method: 'POST', … })` with `javascript_tool`.
  3. Report the status in one line.
  4. Close the tab.
- On `401` or `403` (not signed in to BookRough in Chrome, or not admin), say so and ask the developer to sign in. On any other failure, report it.
- **Posting never blocks the merge check.** The verdict comes from the reading, not from the post.

### 6.2 `/vercel-image-cleanup`

After step 8 (verify), or after step 5 when there is nothing to delete, it posts `IMAGE_CLEANUP` the same way:

- `images` is the table as last read;
- `deleted` is what this run deleted, confirmed by that re-read;
- `publishedAt` is derived from the table's age column (an approximation; the time is noted in the payload as read).

A run the developer declined posts the table with `deleted: []`.

### 6.3 `prune-deployments`

- **`pruneDeployments.ts`**, after the run (dry or deleting, successful or not past the plan), posts `PRUNE_DEPLOYMENTS` to `OPS_INGEST_URL` with `OPS_INGEST_TOKEN`:
  - `deleted` holds only deletions that returned `200` or `404`;
  - a run that failed before it had a plan posts nothing.
- **When posting fails:**
  - token unset: the job prints `::notice::` and skips;
  - non-`201`: it prints `::warning::` with the status and the server's message;
  - in both cases **the job still passes.** Pruning is the job's purpose; a dashboard outage must not turn `main` red.
- **The post is built by a pure, unit-tested `buildPruneSnapshot(plan, deletedIds, dryRun)`.**
- **`main.yml`** adds `OPS_INGEST_TOKEN: ${{ secrets.OPS_INGEST_TOKEN }}` and `OPS_INGEST_URL: ${{ vars.OPS_INGEST_URL }}` to the step's env.

## 7. Edge cases & failure modes

- **No snapshot of a source yet** (fresh deploy): that block shows its empty state, and the rest of the page works.
- **Skill run while signed out of BookRough in Chrome:** the post gets `401`; the skill says so; the merge check is unaffected.
- **The token leaks.** Someone can write fake `PRUNE_DEPLOYMENTS` snapshots, and nothing else: no storage readings, no image lists, no reads, no admin access. The page would show a false deployment list until the next real run. The developer rotates the secret in both places. Recorded in `deployment.md`.
- **The token is unset in production but set in GitHub:** the CI post gets `404`, with a warning and a green job. The reverse is a notice and a skip.
- **Clock skew:** `capturedAt` up to 5 minutes ahead is accepted. Beyond that, `422`.
- **A replayed or duplicated post:** stored twice, which is harmless. The "change since previous reading" for a duplicate is 0.
- **The CI push run posts before the new deployment is live.** The list shows it as "Building". The nightly run settles it, as `deployment-pruning.md` §5.1 already describes.
- **Images snapshot older than the deployments snapshot:** `inUse` and the joined image sizes use what is stored. Each block shows its own age, so the mismatch is visible, not hidden.
- **A Vercel UI change** that breaks `collect-usage.js`: the skill already refuses to report a missing storage meter, so it posts nothing. The Usage block goes Stale after 48 hours, which is the intended signal.
- **`pg_database_size` fails or is slow:** the overview answers `500` like any database failure. Postgres is the same database every other figure comes from.
- **Bots calling `/api/settings?open=1`:** counted. The figure is a rough signal, which the note says. The global rate limit bounds it.
- **Two opens at the same moment on a new day:** the upsert is a single `INSERT … ON CONFLICT (day) DO UPDATE`. If Prisma's `upsert` doesn't emit that natively for this shape, the service uses raw SQL, justified in the code as the only way to make the increment atomic.
- **The admin's account is deleted:** their snapshots remain with `written_by_id = null`, which is never shown anyway.
- **Privacy:** the overview response contains no email, Google `sub`, display name or user id. Asserted by tests (§8).

## 8. Test scenarios

**Unit — `services/opsSnapshots.ts`**

- ✅ Each source's schema accepts a valid payload. `deleted_count` is computed from `deleted.length` (0 for `VERCEL_USAGE`).
- ❌ Each schema rejects:
  - an extra key;
  - an oversized array;
  - a negative or non-finite number;
  - a bad digest, SHA or tag;
  - a string over its limit;
  - a missing storage meter;
  - `limitBytes` of 0.
- ❌ `capturedAt`: unreadable, more than 7 days old, or more than 5 minutes ahead → `AppError` 422.
- ❌ The source not allowed for this path: `PRUNE_DEPLOYMENTS` by session, any other by token → 422.
- ✅ `recordSnapshot` inserts and deletes rows over 90 days old in the same transaction, leaving the newer ones.

**Unit — `services/adminOverview.ts`**

- ✅ Status thresholds: 59.9 → `ok`; 60 → `watch`; 79.9 → `watch`; 80 → `stop`; over 100 → `stop`.
- ✅ `stale` is false at 47h59m and true at 48h.
- ✅ `changeBytes` is computed against the previous `VERCEL_USAGE` snapshot, and is `null` when there is none.
- ✅ `others` keeps only meters at 60% or more, fullest first; `highestOther` is the fullest overall.
- ✅ `inUse` by tag prefix of a deployment SHA, and the image size joined onto the deployment. Untagged images are not in use. An image matching no deployment is not in use.
- ✅ "Last deletion" picks the newest snapshot with `deleted_count > 0` per source, ignoring newer zero runs.
- ✅ A stored payload the schema rejects is skipped with a `WARN`, and the next older valid one is used. If none is valid, `null`.
- ✅ Opens: today, 7-day and 30-day sums at UTC day boundaries; `countingSince` is the earliest row, or `null`.
- ✅ The database block uses `DB_STORAGE_LIMIT_MB`, defaulting to 512.

**Unit — `recordAppOpen` and the settings controller**

- ✅ The first open of a day creates the row; later opens increment the right column.
- ✅ `open=1` counts. No `open`, `open=0` or `open=yes` doesn't.
- ❌ A database failure in `recordAppOpen` is logged at `WARN`, and the settings response is still `200` with the settings.

**Unit — ingest token guard**

- ✅ The correct token passes.
- ❌ Missing header, wrong scheme, wrong token, or a token of a different length → 401, all with the same message.
- ✅ An unset `OPS_INGEST_TOKEN` → 404.
- 🔒 The token never appears in a log line (logger spy).

**Unit — CI (`pruneDeployments.ts`)**

- ✅ `buildPruneSnapshot` maps the plan's verdicts, sets `dryRun`, and lists only confirmed deletions (`200` or `404`).
- ✅ `postSnapshot` sends a Bearer header to `OPS_INGEST_URL` and accepts `201`.
- ✅ An unset token is skipped with a notice and does not fail.
- ❌ A non-`201` answer prints a warning with the status and does not throw.
- ❌ `fetch` rejects (network) → warning, no throw.

**Unit — `collect-usage.js` byte parsing** (the pure parser, exported for Node)

- ✅ "4.55 GB / 10 GB", "824 MB / 10 GB", "0 B / 10 GB", "1.72 MB / 10 GB".
- ❌ "– / 10 GB" and an unknown unit return `null`.

**Integration — `GET /api/admin/overview`**

- ✅ As an admin, with seeded rows, snapshots of each source and opens → `200`, with every block populated and correct.
- ✅ With no snapshots → `200`, with each Vercel block `null`, `lastDeletion` both `null`, and app and database present.
- ✅ The latest snapshot wins. "Last deletion" survives a newer zero-deletion run.
- ❌ `401` without a session.
- ❌ `403` for a `USER`.
- ❌ `403` for an admin who has not finished onboarding.
- 🔒 The response contains no email-shaped string, no `googleSub`, no display name and no user id.

**Integration — `POST /api/admin/ops/snapshots`**

- ✅ An admin posts `VERCEL_USAGE` → `201`, a row with `written_by_id`, and the next `GET /api/admin/overview` shows it.
- ✅ An admin posts `IMAGE_CLEANUP` with deletions → `deleted_count` is stored.
- ✅ A row with `received_at` 91 days ago is deleted by the next insert; one 89 days old stays.
- ❌ `422` for `PRUNE_DEPLOYMENTS`, an unknown source, a bad payload, or a bad `capturedAt`.
- ❌ `400` for invalid JSON.
- ❌ `401`; `403` (USER).

**Integration — `POST /api/ops/snapshots`**

- ✅ The correct token with `PRUNE_DEPLOYMENTS` → `201`, `written_by_id` null.
- ❌ `401` for no header, the wrong token, or a valid admin cookie but no token (a cookie is not a key here).
- ❌ `422` for `VERCEL_USAGE` with a valid token.
- ❌ `404` when the server has no token configured.
- ❌ Rate limit: the 11th wrong attempt within 15 minutes → `429`.

**Integration — app opens**

- ✅ `GET /api/settings?open=1` signed out, then signed in → today's row reads `signed_out = 1`, `signed_in = 1`.
- ✅ `GET /api/settings` without `open` → no row change.
- 🔒 After opens, the `daily_app_opens` table has only `day`, `signed_in` and `signed_out` (a schema assertion), and no user id appears in the row.

**Component — `AdminOverview`**

- ✅ Renders every block from a full response: meters with status chips and changes, the Neon row with its "Approximate" note, deployments with verdict labels, images with in-use labels and total, last deletions, and app figures with the "opens, not people" note.
- ✅ The source and age line per block, and the **Stale** chip with its guidance when `stale`.
- ✅ A Stop meter is listed first.
- ✅ Empty states per block when a source is `null`; "None in the last 90 days" for each deletion kind.
- ✅ The dry-run note on a dry-run deployments snapshot.
- ✅ Loading skeleton. `LoadError` → Try again reloads.
- ✅ Refresh re-fetches and updates "Updated …". A failed Refresh keeps the data and shows the inline error.
- ❌ A `403` → `NotFound`.
- ✅ The offline header, with Refresh disabled.
- ✅ The tab order is Overview first; `/admin` redirects to `/admin/overview`.

**E2E:** none. The existing admin E2E (`admin-panel.md` §7) lands on `/admin`, which now shows Overview, so its first assertion is updated to open the Users tab. No new golden loop.

**Real-world check after merge** (not automated):

- run `/vercel-usage` and see the Usage block go Live;
- the next `prune-deployments` run shows the deployments block;
- `/vercel-image-cleanup` shows the images block.

## 9. Open questions

- **Neon's Free storage limit:** 0.5 GB or 1 GB per project. Neon's [FAQ](https://neon.com/faqs/free-plan-limits-and-quotas) and [cost docs](https://neon.com/docs/introduction/cost-optimization) say 1 GB; its [pricing post](https://neon.com/blog/new-usage-based-pricing) also mentions 0.5 GB.
  - **The default of 512 MB errs early, not late**, so this doesn't block approval.
  - The developer reads the figure in the Neon console (Project → Settings or Billing) and, if it is 1 GB, sets `DB_STORAGE_LIMIT_MB=1024` in Vercel.

## 10. Decisions log

| Date       | Decision                                                                                             | Reason                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-17 | Two ingest paths: the admin session for the skills, a token for CI, each limited to its own sources. | The skills already run in the developer's signed-in Chrome, so they need no secret. CI can't have a session. Limiting each path to its own sources keeps a leaked token from faking a storage reading. |
| 2026-11-17 | A failed post never fails `prune-deployments` or the `/vercel-usage` merge check.                    | The dashboard is a view. The tools' real jobs, pruning and gating merges, must not depend on it.                                                                                                       |
| 2026-11-17 | Opens are counted only on the start-up settings fetch with `open=1`.                                 | It needs no new request, and re-fetches aren't counted twice.                                                                                                                                          |
