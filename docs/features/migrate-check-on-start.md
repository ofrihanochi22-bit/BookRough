# Feature: Skip the migration step when the database is up to date

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only. Feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                             |
| ------------- | --------------------------------------------------------------------------- |
| **Use cases** | None new. Every cold open (UC-1 sign-in, UC-4 Home) waits on it             |
| **Phase**     | 6 (follow-up to Step 6.1w, `docs/features/client-cache.md` §4.1)            |
| **Branch**    | `chore/migrate-check-on-start`                                              |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged (PR #70) |

---

## 1. Goal

Every cold start of the backend container runs `npx prisma migrate deploy` before the API listens. Measured in Vercel Logs on 2026-11-16 after PR #69: `migrateMs` was 1.9 to 2.6 s on every cold start, every run said "No pending migrations", and each cold open started two instances (one for `/api/auth/me`, one for `/api/settings`) that both paid it. After this ships, a container whose database is already up to date checks that with one query and starts serving, and the Prisma CLI runs only when there is something to apply.

## 2. Why this option

Three options were weighed with the developer on 2026-11-16:

| Option                                         | For                                                                                                                                                                     | Against                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Check first, run the CLI only if needed** | Saves the CLI's start-up on almost every cold start. The image stays self-contained: an empty database is still migrated on start, on any host. No new secret anywhere. | A small amount of our own code reads Prisma's bookkeeping table.                                                                                                                                                                                               |
| B. Migrate in CI before the deployment check   | Saves the whole step, and is the most common pattern for large teams (a "release phase").                                                                               | Production's `DATABASE_URL` would have to live in GitHub Secrets too. Previews would lose automatic migrations. The image would stop being self-contained on another host without an extra switch. Ordering against Vercel's own build is not ours to control. |
| C. Keep as is                                  | No change. Since PR #69 the client cache hides most of the wait.                                                                                                        | About 2 s of server time on every cold start, twice per cold open, all of it wasted when nothing is pending.                                                                                                                                                   |

**Chosen: A.** The developer delegated the choice (2026-11-16) with three requirements: meet the app's needs, put no extra load on the machines that run it, and stay clear of Vercel's and Neon's free-tier limits. A meets all three:

- **Where the time goes.** Timed locally on 2026-11-16 (Windows, local Postgres, read-only `prisma migrate status`): starting the Prisma CLI with no database work at all took about 2 s, and going through `npx` added more. The database part is small. So the 2 s in production is mostly the CLI starting, and a query from the Node process that is starting anyway costs a fraction of it. These local numbers show the shape, not production's exact figures; production's are measured after merge (§7).
- **Vercel.** Hobby allows 4 hours of active CPU a month. The CLI's start-up is CPU work on every instance start; removing it from the common case uses less of that allowance. Image size does not change: `prisma` stays a production dependency, because the CLI is still needed when something is pending.
- **Neon.** One `SELECT` on a small table, instead of the CLI's advisory lock plus its own reads. Neon's compute wakes for the API's first query anyway.

## 3. Scope

**In scope**

- A start-up check in the API process, before `listen`, switched on by `MIGRATE_ON_START=true`.
- The Dockerfile start command: from `sh -c "… npx prisma migrate deploy && … exec node dist/index.js"` to running Node directly, with `ENV MIGRATE_ON_START=true` in the image. Approved by the developer 2026-11-16, delegated with the choice of option (CLAUDE.md §11).
- Replacing the start-command timestamps (`BOOT_STARTED_AT`, `MIGRATE_FINISHED_AT`) with timings Node measures itself.
- `test:docker` proves both paths: an empty database is migrated, and a restart of the same container skips.
- `docs/deployment.md` and `docs/deployment.docx` §3.5 and §3.6: the decision and the new start-up.

**Out of scope**

- **Migrating from CI** (option B). Not built; recorded as the alternative if the check ever proves unreliable.
- **Keep-warm pings.** Still ruled out (`client-cache.md` §2).
- **Neon's own resume time.** Not ours to change on the Free plan; this feature only makes it visible (§5).
- **Any change to how migrations are written or applied.** When something is pending, `prisma migrate deploy` runs exactly as today.
- **Local development.** `npm run dev` does not set `MIGRATE_ON_START`; developers keep using `npm run prisma:migrate`.

## 4. Data model changes

None. The check reads `_prisma_migrations`, the table Prisma's CLI keeps. It is not in `schema.prisma`, so the read is raw SQL, which CLAUDE.md §4 allows when Prisma cannot express the query.

## 5. Behaviour

### 5.1 The check (`backend/src/db/migrateOnStart.ts`)

Runs once, before `listen`, only when `MIGRATE_ON_START` is `true` (trimmed, case-insensitive; anything else is off, like `RATE_LIMITS_DISABLED`).

1. List the local migrations: the folder names under `prisma/migrations` that contain a `migration.sql`.
2. Read `_prisma_migrations`: `migration_name`, `finished_at`, `rolled_back_at`.
3. **Up to date** when every local migration has a row with `finished_at` set and `rolled_back_at` empty, and no row is unfinished and not rolled back (a failed migration Prisma would refuse to continue past).
4. Up to date → log and continue to `listen`. The CLI is not started.
5. Anything else → run the Prisma CLI's `migrate deploy` as a child process, with the same Node binary (`process.execPath`) and the CLI's own entry file (`prisma/build/index.js`, resolved from `node_modules`, no `npx`). Its output passes through to the container's logs.
   - Exit code 0 → log and continue to `listen`.
   - Any other exit code → log `error` and exit with code 1 before serving, as today.

**When in doubt, run the CLI.** A missing table (an empty database), a query error, or a migrations folder that cannot be read all count as "not up to date". The worst case of the check is therefore exactly today's behaviour, never a server that skips a migration it needed.

Rows in the database with no local folder (an older image starting after a newer one migrated) do not count against "up to date". Today's `migrate deploy` does not refuse that case either.

### 5.2 Start-up logs (context `startup`)

| Message                 | Level | Fields                             | When                                                                     |
| ----------------------- | ----- | ---------------------------------- | ------------------------------------------------------------------------ |
| `Migrations up to date` | info  | `checkMs`, `count`                 | The check found nothing to do. `checkMs` includes opening the connection |
| `Migrations applied`    | info  | `checkMs`, `migrateMs`             | The CLI ran and succeeded                                                |
| `Migrations failed`     | error | `checkMs`, `migrateMs`, `exitCode` | The CLI failed; the process exits 1                                      |
| `API listening`         | info  | `port`, `env`, `bootMs`            | Existing line. `bootMs` is now process start to `listen`, check included |
| `Database connected`    | info  | `connectMs`                        | Only when the check is off (local, CI E2E), as today                     |

`checkMs` covers the first connection to Neon, so it also answers what `connectMs` never did in Vercel Logs: how much of a cold start is the database waking. `startupTimings` and its environment variables are removed.

### 5.3 Dockerfile

```dockerfile
# Checked, and applied only when something is pending, by the API itself
# before it listens (docs/features/migrate-check-on-start.md).
ENV MIGRATE_ON_START=true
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
```

`tini` stays PID 1 and forwards signals straight to Node; the exec form needs no `sh`.

## 6. Edge cases & failure modes

- **Two instances start together** (every cold open). Both check; both normally find nothing to do. If a deployment brings a new migration, both may run the CLI, and Prisma's advisory lock serialises them, as today.
- **A failed migration in the database** (a row that never finished). Counted as not up to date, so the CLI runs and fails with Prisma's own message, and the container stops before serving, as today. Recovery is unchanged (`production-deploy.md` §6).
- **An empty database** (`test:docker`, a new Neon branch). The table is missing; the CLI runs and creates everything.
- **A migration edited after it was applied.** The check compares names, not checksums. `migrate deploy` does not refuse that case either; CLAUDE.md §6 forbids it regardless.
- **The database is down at start.** The check's query fails, the CLI runs, the CLI fails, the container exits 1. Today the CLI fails the same way.
- **The CLI cannot be found** (a broken image). Spawning fails; logged as `Migrations failed` and exit 1. `test:docker` would catch it.
- **SIGTERM during the check or the CLI.** During the check, Node has not registered its shutdown handler yet, so it stops with the signal. During the CLI, the signal is passed on to it, the CLI's non-zero exit is logged as `Migrations failed`, and Node exits 1. Nothing has been served either way.

## 7. Test scenarios

**Unit (`backend/src/db/migrateOnStart.test.ts`)**, with the query, the folder listing, the child process and the clock injected:

- ✅ Every local migration finished → up to date, CLI not started, `Migrations up to date` with `checkMs` and `count`.
- ✅ A local migration with no row → CLI started; exit 0 → `Migrations applied`, resolves.
- ✅ The table does not exist (query throws) → CLI started.
- ✅ Extra rows with no local folder → still up to date.
- ❌ A row unfinished and not rolled back → CLI started.
- ❌ A matching row that was rolled back → CLI started.
- ❌ The CLI exits non-zero → `Migrations failed` with `exitCode`, and the function reports failure (the caller exits 1).
- ❌ The CLI cannot be spawned → `Migrations failed`, failure reported.
- ❌ The migrations folder cannot be read → CLI started.
- ✅ Folders without `migration.sql` (and `migration_lock.toml`) are ignored.

**Unit (`backend/src/config/env.test.ts`)**

- ✅ `MIGRATE_ON_START` `true` / `TRUE` → on.
- ❌ Unset, empty, `false`, `1` → off.

**Integration** — against `music_app_test_db`, migrated by the suite's setup:

- ✅ The real check, against the migrated test database and the real `prisma/migrations` folder, reports up to date without starting the CLI.

**`test:docker` (`main.yml`)**

- ✅ Empty database: the container logs `Migrations applied` and `/api/settings` answers (existing step).
- ✅ `docker restart api`: the second start logs `Migrations up to date` and `/api/health` answers.
- ✅ Graceful stop still exits 0 through `tini`, now with Node as its direct child.

**Component / E2E** — none. Nothing visible changes; the E2E job starts Node without the switch.

**After merge (developer, Vercel → Logs):** a few cold starts show `Migrations up to date` with `checkMs`, and `bootMs`. Expected: the cold start is shorter by most of the old `migrateMs`. The numbers are written into `docs/deployment.md` §3.6.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                                                                    | Reason                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Option A, check first. Developer delegated the choice: meet the app's needs without extra load or free-tier risk                                            | Saves the CLI start-up on nearly every cold start; no secret in CI; the image stays self-contained |
| 2026-11-16 | Start command becomes `node dist/index.js` with `ENV MIGRATE_ON_START=true` (developer approval, delegated)                                                 | One Node process instead of two; the check and its timing live in the code that can test them      |
| 2026-11-16 | When in doubt, run the CLI                                                                                                                                  | The check's worst case is today's behaviour                                                        |
| 2026-11-16 | A stop signal during the CLI is forwarded to it (code review)                                                                                               | `tini` signals only Node; the CLI would otherwise run on, orphaned, until the container is killed  |
| 2026-11-16 | Measured locally on the built image against a fresh Postgres: first start `migrateMs` 1507, `bootMs` 2564; restarts `checkMs` 67 to 76, `bootMs` 619 to 654 | Confirms the CLI's start-up was the cost; production numbers are read after merge (§7)             |
