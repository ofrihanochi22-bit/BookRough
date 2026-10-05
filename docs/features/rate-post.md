# Feature: Rate a post

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| **Use cases** | UC-13 (rate a bookmarked recommendation); UC-12 touched (a rated post can't be saved) |
| **Phase**     | 4 — Step 4.2 of `DEVELOPMENT.md` (absorbs former 4.3; see `bookmarks-my-list.md` §0)  |
| **Branch**    | `feat/rate-post`                                                                      |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                    |

---

## 1. Goal

On My List, a member taps **Rate & Review** on a song they saved, picks a score from 1 to 10, optionally writes a comment, and submits. The rating is saved, the song leaves their My List, and the post's author is "notified" — for now a structured log line, the hook where a real channel will plug in later (former Step 4.3). If the post was deleted while it sat in the list, the row disappears with UC-13's message. In the feed, the rater sees "You rated 8/10" on the post. Everyone else sees ratings from feature 3 (Post Detail, UC-16).

## 2. Scope

**In scope**

- Schema: the `ratings` table (§3).
- Endpoint: submit a rating (§4); `PublicPost.myScore`; saving a rated post is refused.
- My List: the **Rate & Review** button, and "You're no longer in {community}" in its place for a community you left (§5.1).
- The rating sheet: 1–10, optional comment, Submit (§5.2).
- The feed card: "You rated n/10" instead of the bookmark icon once rated (§5.3).
- The notification stub (former Step 4.3): an `info` log line, and a marked place for the real channel (§4.2).
- Doc updates (§9).

**Out of scope** — deliberately

- Rating from the feed or anywhere but My List (developer's choice, option A). The API does not require a bookmark, so a later entry point needs no API change.
- Rating by a former member — whether they left or were removed (option B).
- Rating your own post: never in My List (bookmarks-my-list.md); the server refuses with `403`.
- Editing or deleting a rating. A rating is final in this PR; feature 3 may revisit it where ratings are shown.
- The average rating, the list of reviews, anyone else's ratings — feature 3 (UC-16). No endpoint here returns another user's rating.
- A real notification channel (push, in-app inbox, email — there is no email, CLAUDE.md §5).
- Half points, or a different scale.
- Offline rating or a queued rating (CLAUDE.md §16: nothing is queued invisibly).
- Visual design: the 1–10 control and the sheet are placeholders from existing primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --create-only --name add_ratings`, then a hand-written `CHECK` appended (Prisma cannot express it), applied with `npx prisma migrate dev`; drift checked; `community_members_one_owner` untouched. `ratings` joins the TRUNCATE list in `backend/src/test/db.ts`.

### 3.1 `ratings`

```prisma
/// One member's rating of a post (UC-13, docs/features/rate-post.md §3).
/// Final once written. `score` is 1–10, enforced by Zod and by the
/// hand-written CHECK `ratings_score_range` in the add_ratings migration.
model Rating {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  score     Int      @db.SmallInt
  comment   String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
  /// The rater's own ratings, for `myScore` and the account cascade.
  @@index([userId])
  @@map("ratings")
}
```

```sql
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 10);
```

- One rating per user per post (`tables.md`); the unique index also serves feature 3's "ratings of a post".
- `comment`: the post-comment rules (NFC, trim, line breaks kept, ≤ 280 graphemes); blank → `null`.
- Cascades: deleting the post (UC-18's promise that ratings go with it), its community, or the rater's account deletes the rating.
- A rating **outlives its rater's membership** — leaving or removal does not delete it, as with posts after leaving (posts-feed §3.2). Feature 3 decides how such a rating is shown.

## 4. API

All responses use the CLAUDE.md §4 envelope. A malformed or unknown post id, or a post in a community the caller is not currently in, gets `404` "Post not found." (as in posts-delete and bookmarks).

### Shapes

```ts
PublicPost {
  // …every existing field, plus:
  myScore: number | null;   // the viewer's own rating, if any; never anyone else's
}

PublicRating {              // utils/publicRating.ts, field by field
  id: string;
  score: number;            // 1–10
  comment: string | null;
  createdAt: string;
}
```

`postInclude(viewerId)` gains the viewer's own rating (`ratings: { where: { userId: viewerId }, select: { score: true } }`), like the bookmark. `SavedPost.post` carries it too (always `null` there: rating removes the bookmark).

### `POST /api/posts/:postId/ratings`

- **Auth:** signed in; a current member of the post's community; not its author.
- **Request:** `{ score: number, comment?: string | null }`, `.strict()`. `score` an integer 1–10; `comment` raw ≤ 4000 characters, cleaned then ≤ 280 graphemes.
- **Behaviour:** in one transaction, insert the rating and delete the caller's bookmark on that post (if any). Then the notification stub (§4.2). The caller does not need a bookmark (§2).
- **Success:** `201 { rating: PublicRating }`.
- **Errors:**
  - `400` unparseable JSON.
  - `401` signed out.
  - `403` "You can't rate your own post."
  - `404` "Post not found." — unknown or malformed id, a deleted post (also when it is deleted mid-request: the foreign key fails), or the caller is not a member of its community now.
  - `409` "You already rated this post." — a second rating (the unique index decides, so two tabs cannot both win).
  - `422` "Choose a score from 1 to 10." — missing, non-integer or out-of-range score; "Comments can be up to 280 characters."; an unknown key.

Order of checks: post exists → membership (`404`) → author (`403`) → payload (`422`) → insert (`409` / `404`).

### Changes to existing endpoints

- `PUT /api/posts/:postId/bookmark` — a post the caller has rated → `409` "You already rated this post." (checked after membership and authorship).
- `GET /api/communities/:id/posts`, `POST /api/posts/:postId/conversion`, `POST /api/communities/:id/posts`, `GET /api/users/me/bookmarks` — each post gains `myScore`.

### 4.2 The notification stub (former Step 4.3)

After the transaction commits, `services/ratingNotification.ts` `notifyAuthorOfRating({ authorId, raterId, postId, score })` logs `info` `{ context: 'ratingNotification', authorId, raterId, postId, score }` "Rating notification (stub)". A comment marks it as the single place a real channel plugs in. The comment text, titles and names are never logged. A failure inside the stub is caught and logged at `warn` — it never fails the rating, which is already saved.

### Logging

`info` `{ userId, postId, score }` "Post rated" from the service, plus the stub's line.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 My List (`SavedPostCard`)

- A member's card gains **Rate & Review** (the card's primary action; Open stays). `aria-label` names the song.
- `isMember: false` → no button; a quiet line "You're no longer in {community}" — Open and Remove stay.
- Offline → Rate & Review disabled (the existing banner explains).

### 5.2 Rating sheet (`components/RatingSheet.tsx`)

Opens over My List on **Rate & Review**. Title "Rate & Review"; the song's title and artist (or "Shared from {service}" when pending).

- **Score:** ten options 1–10 as a radio group labelled "Your score" (placeholder control). Nothing is selected at first.
- **Comment** (optional): a textarea with the counter n/280, the post-comment rules mirrored client-side.
- **Submit Rating:** disabled until a score is chosen; while waiting "Submitting…", the fields read-only and the sheet not dismissible.
- `201` → the sheet closes, the toast "Rating submitted", and the card leaves My List.
- `404` → the sheet closes, the card leaves My List (the "ghost" bookmark), and the toast "This recommendation is no longer available as the original post was deleted." (UC-13).
- `409` → the sheet closes, the card leaves My List, and the toast "You already rated this post."
- `403` → toast with the server's message, the sheet closes (cannot happen from the UI; own posts are never listed).
- `422` → the message inline in the sheet; the draft stays.
- Network failure or `5xx` → inline "Couldn't submit your rating. Check your connection and try again."; the draft stays.
- Going offline while open → Submit disabled.

### 5.3 Feed card (`PostCard`)

- `myScore !== null` → in place of the bookmark icon, a quiet "You rated {n}/10" label. No bookmark icon (§4: saving a rated post is refused).
- A bookmark save answered `409` (rated in another tab) → revert, toast "You already rated this post.", reload the feed.

### 5.4 States

My List's loading, empty, error and offline states are unchanged (bookmarks-my-list.md §5.2).

## 6. Edge cases & failure modes

- **Post deleted while in My List** → rating answers `404` → the ghost row leaves with UC-13's message. The bookmark row is already gone (cascade).
- **Post deleted mid-request** → the insert fails its foreign key → `404`, nothing saved.
- **Rater removed or leaves between opening the sheet and submitting** → `404`; the row leaves locally. On the next load it reappears with "You're no longer in {community}" (the bookmark outlives membership). Accepted: rare, and the next load is truthful.
- **Two tabs rate the same post** → one `201`, one `409`; one bookmark delete is a no-op.
- **Rating a post that was not saved** (only possible through the API) → allowed; there is no bookmark to delete.
- **Saving after rating** → `409`; the feed shows "You rated n/10" and no icon.
- **The author** never sees their own post in My List; the API refuses `403`.
- **Score of 0, 11, 7.5, "7", null** → `422`. A score that slipped past validation would fail the database `CHECK` → `500`, never stored.
- **Comment of only whitespace** → `null`. Over 280 graphemes → `422`.
- **The notification stub throws** → logged at `warn`; the rating stands and the response is `201`.
- **A rated post's author is later removed** → their posts are deleted, and the ratings on them with them.
- **The rater's account is deleted** → their ratings cascade.
- **Privacy:** no endpoint here exposes another user's rating; `myScore` is the viewer's own.

## 7. Test scenarios

**Unit (services and serialisers)**

- ✅ `rating.service.ratePost`: a member rates someone else's post → rating created and their bookmark deleted in one transaction; the stub is called with author, rater, post and score.
- ✅ `ratePost` without a bookmark → rating created, nothing else touched.
- ❌ `ratePost`: unknown post → `404`; non-member → `404`; own post → `403` (membership checked first: a former author who left gets `404`); bad score → `422`; comment too long → `422`.
- ❌ `ratePost`: unique violation (`P2002`) → `409`; foreign-key violation (`P2003`) → `404`; any other database error passes through.
- ✅ The stub throwing → still resolves with the rating, `warn` logged.
- ✅ `notifyAuthorOfRating` logs exactly `{ context, authorId, raterId, postId, score }` — no comment.
- ✅ `toPublicRating`: exact key set.
- ✅ `toPublicPost`: `myScore` from the viewer's own row only; `null` when absent.
- ❌ `saveBookmark` on a rated post → `409`.
- ✅ Frontend `lib/ratingText`: comment cleaning and the 280 limit, mirroring the server.

**Integration (Supertest, scraper mocked)**

- ✅ `POST /posts/:id/ratings` → `201` with `PublicRating`; the row exists; the rater's bookmark is gone and My List no longer lists it; another member's bookmark on the same post stays.
- ✅ The feed then shows `myScore: 8` to the rater and `null` to everyone else.
- ✅ Rating with no bookmark → `201`.
- ❌ `400` unparseable JSON; `422` score 0, 11, 7.5, a string, missing; comment 281 graphemes; unknown key.
- ❌ `401` signed out; `403` own post; `404` stranger, unknown id, malformed id, deleted post, after leaving, after removal.
- ❌ `409` a second rating; `PUT /bookmark` on a rated post → `409`.
- ✅ Deleting the post deletes its ratings; deleting the community too; deleting the rater's account too.
- ✅ Leaving keeps the rating (the row survives).
- 🔒 The response has exactly `PublicRating`'s keys; no feed payload carries another user's score.

**Component (Vitest + RTL, toasts mocked)**

- ✅ SavedPostCard: Rate & Review on a member's card; "You're no longer in {community}" and no button after leaving; disabled offline.
- ✅ RatingSheet: Submit disabled until a score; choosing 7 and submitting sends score 7 and the cleaned comment; "Submitting…" and read-only while waiting; the counter.
- ✅ MyList: success → the card leaves and "Rating submitted".
- ❌ MyList: `404` → the card leaves with UC-13's message; `409` → the card leaves with "You already rated this post."; `422` → inline, draft kept; network failure → inline, draft kept; comment over 280 → inline before any request.
- ✅ PostCard: `myScore` → "You rated 8/10" and no bookmark icon.
- ❌ PostCard: a save answered `409` → reverts, toast, feed reload.

**E2E (Playwright, scraper stand-in)** — the golden loop's "rate" step

- ✅ B saves A's post, opens My List, Rate & Review → 8 with a comment → "Rating submitted", My List is empty; back in the feed the post shows "You rated 8/10" and no bookmark. (A sees ratings only with feature 3.)

## 8. Open questions & risks

- None at approval. Feature 3 inherits: ratings outlive the rater's membership (how to show them); a rating is final in this PR (whether to allow editing where ratings are shown).

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `ratings` — `created_at` as `timestamptz`, the score `CHECK`, the indexes, the cascades, survives the rater leaving.
- `docs/use cases.md` + `.docx`: UC-13 — from My List only, current members only, the author cannot rate, a second rating is refused, the notification is a log stub for now; UC-12 — a rated post can't be saved.
- `docs/frontend screens.md` + `.docx`: 3.1 (the "You rated n/10" label), 4.1 (Rate & Review, the former-member line), 4.2 (the rating sheet and its states).
- `DEVELOPMENT.md`: Step 4.2's entry per §13; Step 4.3 already marked merged into it.
- `bookmarks-my-list.md`: Merged ticked; §5.1 notes the rated case.
- CLAUDE.md §6 if the hand-written `CHECK` needs mentioning alongside the partial index (it is invisible to `prisma migrate diff`, so a reader should know it exists).

## 10. Decisions log

| Date       | Decision                                                                                       | Reason                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-10-05 | Rate from My List only (option A)                                                              | Developer's choice; exactly UC-13                                                             |
| 2026-10-05 | Only current members can rate (option B)                                                       | A removed member must not keep writing into the community; consistent with every other action |
| 2026-10-05 | A rated post can't be saved again (`409`); the feed shows "You rated n/10" instead             | Nothing would be left to do with it in My List; the label explains the missing icon           |
| 2026-10-05 | A rating is final in this PR                                                                   | No UI place to edit it (it leaves My List); feature 3 may revisit                             |
| 2026-10-05 | The API does not require a bookmark to rate                                                    | My List is a UI choice; a later entry point needs no API change                               |
| 2026-10-05 | Rating and bookmark delete in one transaction; the stub after commit, never failing the rating | The rating is the user's content; a notification problem must not lose it                     |
| 2026-10-05 | Score 1–10 enforced by Zod and a hand-written `CHECK`                                          | Defence in depth; the database never holds an impossible score                                |
| 2026-10-05 | Comment rules = post-comment rules (≤ 280 graphemes, line breaks kept)                         | One set of text rules for short user text                                                     |
| 2026-10-05 | The notification stub logs ids and score only                                                  | No comment text or names in logs (CLAUDE.md §4)                                               |
