# Mock data for manual testing

A repeatable set of fake users, communities, posts and interactions, injected into the **local** dev database around the two real test accounts, so a manual test session can see how BookRough looks and behaves with a realistic amount of data. Everything it adds can be removed at the end of the session, leaving the real accounts as they were.

Status: **built** on 2026-11-22 (`chore/mock-data-seed`). Generated: 14 users, 23 friendships, 8 communities, 29 memberships, 1 ban, 1 invitation, 84 posts (68 community + 16 direct), 123 ratings, 23 comments, 16 bookmarks, 83 notifications.

---

## 1. Where it runs

| Item   | Value                                     |
| ------ | ----------------------------------------- |
| Real A | **OfriChrome** — Chrome, Spotify, `ADMIN` |
| Real B | **OfriEdge** — Edge, Apple Music          |

**The rule: local only.** The script refuses to run unless `DATABASE_URL` points at `localhost` / `127.0.0.1` (`music_app_dev` on `localhost:5433`). It finds A and B by display name and stops if either is missing (both must have signed in and finished onboarding first).

**The one exception, 2026-11-22: production, once.** The developer wants to see the data on a phone through the real site, and production has no real users yet (on 2026-11-22: only A and B, 1 community, 5 posts, 1 friendship, 26 migrations, the same as the code). For this one session only:

- The script also writes the same data as two plain SQL files, `seed.sql` and `remove.sql`. Claude runs them on Neon's `production` branch through the Neon connector, in one transaction each, after the developer says yes. The connection string never reaches Claude or the script, and the script itself still has no production mode.
- The existing production rows (A, B, their community, posts and friendship) are not touched by either file.
- **`remove.sql` runs before the site goes to real users**, whatever else happens. Until then, anyone who signs in sees the mock users in search.
- After this session, production gets no mock data again. Future sessions are local.

## 2. How it is marked, so it can be removed

- Every mock user has `google_sub = 'seed-mock-NN'` (they cannot sign in).
- Every mock community and every mock post gets a fixed UUID with a recognisable prefix: users `5eed0001-…`, communities `5eed0002-…`, posts `5eed0003-…`, ratings `5eed0004-…`, comments `5eed0005-…`.
- **Removal** deletes, in order: posts with the `5eed0003` prefix, communities with `5eed0002`, users with `seed-mock-`. The schema's cascades take everything hanging off them: memberships, bans, invitations, ratings, bookmarks, comments, notifications and friendships — including what A and B did to mock data during the session (a rating on a mock post, a post in a mock community, a bookmark).
- **Not removed:** anything A or B creates that touches no mock row — e.g. a new community A creates during the session with only B in it. Delete those through the app.
- Seeding is idempotent: running it again first removes the previous mock set, then inserts it fresh.

## 3. The data

### 3.1 Users — 14 mock users

| #   | Name            | Service     | Relation to A          | Relation to B          |
| --- | --------------- | ----------- | ---------------------- | ---------------------- |
| 01  | Maya Levi       | Spotify     | friend                 | friend                 |
| 02  | Noam Cohen      | Tidal       | friend                 | friend                 |
| 03  | דנה שגיא        | YouTube     | friend                 | —                      |
| 04  | Yoni Mizrahi    | Deezer      | friend                 | —                      |
| 05  | Tamar Ben-David | Apple Music | friend                 | —                      |
| 06  | Lior Avraham    | Tidal       | friend                 | friend                 |
| 07  | Itay Shapira    | Spotify     | —                      | friend                 |
| 08  | Shira Katz      | Apple Music | —                      | friend                 |
| 09  | עומר פרץ        | Spotify     | —                      | friend                 |
| 10  | Gal Friedman    | Spotify     | request → A (incoming) | —                      |
| 11  | Roni Peled      | Deezer      | A → request (outgoing) | request → B (incoming) |
| 12  | Avi Goldberg    | YouTube     | stranger               | stranger               |
| 13  | Neta Rosen      | Apple Music | stranger               | stranger               |
| 14  | Eden Biton      | Spotify     | stranger               | stranger               |

A has 6 mock friends, B has 6 (plus each other, if that friendship already exists — the seed does not touch real-to-real rows). Join dates are spread over the last 60 days. All mock users have generated avatars (no photos).

### 3.2 Communities — 8

| ID  | Name             | Owner | Admins | Other members             | A       | B      | Posts |
| --- | ---------------- | ----- | ------ | ------------------------- | ------- | ------ | ----- |
| C1  | Indie Rock Night | **A** | Maya   | B, Noam, דנה, Lior, Tamar | OWNER   | MEMBER | 25    |
| C2  | Jazz & Coffee    | **B** | —      | A, Shira, Itay, Lior      | MEMBER  | OWNER  | 10    |
| C3  | מזרחית ותיקה     | עומר  | —      | A, B, Itay                | MEMBER  | MEMBER | 8     |
| C4  | Workout Bangers  | Itay  | **B**  | Shira, Gal                | —       | ADMIN  | 8     |
| C5  | Lo-fi Study      | Noam  | —      | Yoni, דנה                 | invited | —      | 6     |
| C6  | Hip-Hop Heads    | Avi   | —      | Neta, Eden                | —       | —      | 6     |
| C7  | Classical Corner | Neta  | —      | Avi                       | —       | —      | 4     |
| C8  | Empty Room       | Eden  | —      | —                         | —       | —      | 0     |

- A owns C1; B owns C2 and is an admin of C4. A is in 3 communities, B in 4.
- C1 has 25 posts over 30 days, so the feed scrolls and pages.
- C1 has one ban (Roni, banned by A), so Settings & Members shows a blocked list.
- C5 has a pending invitation to A from Noam. C6–C8 are communities neither real user belongs to; C8 is empty (its empty state).

### 3.3 Posts — 68 community posts + 16 direct recommendations

- Real songs and albums (artist and title correct), spread across genres to match each community.
- Mix of shapes: mostly converted tracks, some albums, 2 link-only (one Bandcamp, one SoundCloud), 1 YouTube video, 2 with `conversion_pending` (the "other services unavailable" note).
- About half carry a text comment; one has an edited comment.
- A and B are authors too: about 6 of A's posts in C1–C3 and 5 of B's in C1–C4.
- **Links and covers:** the Apple Music link and the cover come from one lookup in Apple's public iTunes Search API, done once when the data file is built and stored in it (no lookup at seed time). The other services' links are that service's search URL for "artist title", so every button opens something real. The scraper is never called.
- **Direct recommendations (UC-20):** mock friends → A (5), mock friends → B (5), A → mock friends (2), B → mock friends (2), A ↔ B (1 each way). One of B's received ones is already hidden.

### 3.4 Engagement

- **Ratings:** about 120, scores 1–10, about 40% with a review; several on A's and B's own posts, so their posts show averages.
- **Discussion (UC-22):** about 30 comments across 6 posts, including flat threads under a review and under a post comment, some replying to A's and B's reviews; one deleted comment ("comment removed" state).
- **Bookmarks / My List:** A 8, B 6.
- **Notifications (UC-21):** a realistic inbox — A about 15, B about 12, some read and some unread: grouped new-posts, recommendations, ratings, friend requests, an accepted request, C5's invitation for A, B's admin role in C4, comment replies. Each respects the hand-written unique indexes (one open group per reader and community).

The admin area then shows 16 users and 8+ communities, which is the realistic view for testing the lists and the delete dialog.

## 4. Implementation

Everything is in `backend/scripts/mock-data/`:

- `data.ts` — users, friendships, communities, posts, direct recommendations, hand-written ratings, comments and bookmarks, as plain constants.
- `songs.json` — the 84 songs and albums: title, artist, cover and Apple Music link, looked up once on 2026-11-22 in Apple's public iTunes Search API (no key, no account) and stored here, so a seed never calls it. To add a song, add an entry by hand with the same fields.
- `seed.ts` — builds the SQL from the two files. The remaining ratings come from a fixed-seed random generator (same result every run), and the notifications are derived from the data the way the app writes them, respecting the hand-written unique indexes.
  - Ids and times are written as calls to four session-only helpers in `pg_temp`, created at the start and dropped at the end, which keeps the SQL small enough to send through the Neon connector.
  - The statements are fixed text built from these files' constants, never user input, so `$executeRawUnsafe` is safe here. The app's own code in `backend/src` keeps bound parameters (eslint enforces that there).
- `scripts/tsconfig.json` — typecheck with `npx tsc -p scripts/tsconfig.json` from `backend/`. The scripts are outside `src/`, so neither the build nor coverage includes them. ESLint covers them.
- `out/` (git-ignored) — what `--write-sql` writes.

## 5. Reusing it in a future session (local only)

1. Docker Desktop running, `docker compose up -d`, both servers started.
2. A and B signed in and onboarded in Chrome and Edge.
3. `cd backend && npx tsx scripts/mock-data/seed.ts`. It replaces any earlier mock set and prints a row count per statement.
4. Test, keeping the live log (`manual-test-YYYY-MM-DD.md` at the repo root).
5. `cd backend && npx tsx scripts/mock-data/seed.ts --remove`.

Rows that A or B created during the session that touch no mock row (for example, a new community with only B in it) are not removed. Delete them through the app.

## 6. Production log

| Date       | Action                                                            | Result  |
| ---------- | ----------------------------------------------------------------- | ------- |
| 2026-11-22 | `seed.sql` on Neon `production` through the connector (README §1) | pending |
| —          | `remove.sql` before the site goes to real users                   | pending |
