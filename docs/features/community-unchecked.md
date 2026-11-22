# Feature: Unchecked community recommendations

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| **Use cases** | UC-20 amended (the Recommendations screen), UC-11 (community posts)             |
| **Phase**     | 6 — parked idea D1 from the 2026-11-22 manual test                              |
| **Branch**    | `feat/community-unchecked`                                                      |
| **Status**    | ☑ Spec approved (2026-11-22) · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged |

---

## 1. Goal

Today a community post shows only in its own community's feed. The bell's "N new posts" group says it exists, and it reaches My List only if the user saves it. After this ships, the Recommendations screen has a third tab, **From communities**: one list, across every community the user is in, of other members' posts the user hasn't checked yet. Any real action on a post takes it off the list, and so does a "Mark checked" button with Undo.

## 2. Scope

**In scope**

- **What counts as checked** (Stage 1 answer 1). A post leaves the list when the user does one of these, on any screen:
  - opens one of its streaming links (the "Open in …" pill, or a link in Other services);
  - opens its Post Detail;
  - rates it;
  - saves it to My List;
  - presses **Mark checked** on it in the new tab.
- **Where** (answer 2). A third option, "From communities", in the Recommendations screen's pill switch, after Received and Sent. Received stays the default.
- **Which posts** (answer 3: clean start). A post is on the list when all of these are true:
  - it's a community post (not a direct recommendation);
  - the user is a member of its community now;
  - someone else wrote it;
  - it was created at or after **both** the user's `joined_at` in that community and the user's `community_checks_since` (§3), which is the moment this feature's migration ran, or sign-up for a newer account;
  - the user hasn't checked it.
- **Counts and the bell** (answer 4: separate). The bell, its `COMMUNITY_POSTS` groups and reading them don't change, and reading a notification doesn't check a post. The Recommendations row on Friends keeps counting direct recommendations only. The new pill shows its own count, "From communities · 4", and plain "From communities" at 0.
- **After checking** (answer 5). The post just leaves the list. It stays in its community's feed, and in My List if it was saved. **Mark checked** shows a toast with **Undo**, which puts it back. There is no "checked" history screen.

**Out of scope**

- **D2**: archiving recommendations you've checked and rated, or any history of checked posts. Kept as a separate later feature.
- Any change to the bell, notifications, or the Friends tab's Recommendations count.
- A "checked" marker on cards in the community feed. The feed looks exactly as it does today.
- Retroactive history: posts from before the migration ran, or from before the user joined the community.
- "Mark all checked". Not asked for; it can be added later.
- Offline queueing. An automatic check that fails offline is simply lost (§6).
- Direct recommendations. They keep Received with its own "seen" marker.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_community_post_checks`.

**New table `community_post_checks`**: one row per (user, post) the user has checked.

| Column       | Type             | Null | Default | Notes                                                                          |
| ------------ | ---------------- | ---- | ------- | ------------------------------------------------------------------------------ |
| `user_id`    | `uuid`           | no   |         | FK → `users.id`, `ON DELETE CASCADE`                                           |
| `post_id`    | `uuid`           | no   |         | FK → `posts.id`, `ON DELETE CASCADE` (a deleted post takes its checks with it) |
| `checked_at` | `timestamptz(3)` | no   | `now()` | Written for debugging only; never read by the app                              |

- Primary key `(user_id, post_id)`, so checking twice is one row.
- Index `(post_id)` for the post-delete cascade.
- No row is written for a direct recommendation or the user's own post. The service enforces that, so no hand-written CHECK is needed.

**New column `users.community_checks_since timestamptz(3) NOT NULL DEFAULT now()`**: the clean start. The migration gives every existing user the moment it runs, and a new user gets the moment they sign up. It's never serialised: `toPublicUser` is field by field, so nothing changes there.

`docs/tables.md` (+ `.docx`) gains the table and the column. With `community_post_checks`, CLAUDE.md §6 becomes seventeen tables.

## 4. API

All under the existing `recommendationsRouter`. All need auth and an onboarded user (`requireOnboarded`), like the rest of the router.

### `GET /api/recommendations/community?before=<cursor>`

- **Request:** query `{ before?: string (max 200) }`, `.strict()`, the same cursor format as Received.
- **Success:** `200 { items: Array<{ post: PublicPost; community: { id: string; name: string } }>, nextCursor: string | null }`. Newest first, keyset-paginated, page size `PAGE_SIZE`.
- **Query:** raw SQL for the page's post ids, because Prisma can't compare `posts.created_at` with `community_members.joined_at` (CLAUDE.md §4 allows raw SQL here). Then a `findMany` with `postInclude`, re-ordered by the ids, and the usual `toPublicPost` with rating summaries.
- **Errors:** `422` a bad query shape or a malformed cursor (§9); `401` unauthenticated; `403` not onboarded (the existing `requireOnboarded` rule).

### `GET /api/recommendations/community/count`

- **Success:** `200 { count: number }`, the same rule as the list without a page limit.
- **Errors:** `401`, `403` not onboarded.

### `PUT /api/recommendations/community/:postId/checked`

- **Request:** `postId` as a UUID (`parsePostId`). No body.
- **Behaviour:** `requirePostAccess`. Writes the row with `createMany … skipDuplicates`, so it's idempotent. On the user's own post it does nothing and still answers `200`, because callers mark on open without checking who wrote the post. A post from before the clean start is recorded the same way; that's harmless.
- **Success:** `200 { data: null }`.
- **Errors:**
  - `404` a malformed post id (the shared `parsePostId` rule, as on every post route);
  - `401`;
  - `403` not onboarded;
  - `404` "Post not found.": the post is missing, the caller isn't a member, it's a direct recommendation, or it was deleted between the check and the insert (P2003).
  - There's no "wrong permissions" `403` for a non-member: like every post route, an outsider gets the same `404`, so they can't learn the post exists.

### `DELETE /api/recommendations/community/:postId/checked`

- **Behaviour:** Undo. Deletes the caller's own row, if there is one, and is idempotent. Access is checked as for PUT, so a removed member's undo gets `404`.
- **Success / errors:** as for PUT.

### Changes to existing writes

- `ratePost`, in the same transaction as the rating: if it's a community post, upsert the rater's check row.
- `saveBookmark`, after the insert: if it's a community post, write the check row (`createMany skipDuplicates`).
- `removeBookmark` doesn't remove the check. Saving was the action; unsaving doesn't put the post back on the list.

## 5. Screens & components

### Recommendations (2.5)

- `PillTrack` gets a third option, "From communities", with its count (`From communities · 4`, plain at 0). The count is fetched when the screen opens and after every change made in the tab.
- **The list:** the feed's `PostCard`, with a small line above each card, "in **{community}**", which links to `/communities/:id` (the name isolated with `<bdi>`, CLAUDE.md §8). The card's usual actions work: Open in, Other services, bookmark, Comments, and Rate & Review (the `onRate` prop, as on Received).
- **Mark checked:** a secondary chip on each card in this tab only. Pressing it removes the card at once and shows a toast, "Marked as checked", with an **Undo** button. Undo calls DELETE, then reloads the list and the count. If the PUT fails, the card comes back and the toast says "Couldn't mark it checked."
- **Other actions in the tab** remove the card locally, because the server has checked it: opening a link, saving, or a finished rating.
- **Loading:** three skeletons and `LoadingHint`, as on Received.
- **Empty:** "You're all caught up" / "New posts from your communities appear here until you check them."
- **Error:** `LoadError` with "Couldn't load posts from your communities." and Try again. Load more failing works as on Received.
- **Offline:** Mark checked is disabled (the `offline` button state), as the other writes are.

### Everywhere a community post is shown

- `PostCard`: opening the main link or a link in Other services on a community post written by someone else calls the PUT in the background. There's no toast, and a failure is ignored. The client tells a community post apart by `post.direct === null`.
- `PostDetail`: once the post has loaded, if it's a community post written by someone else, the same background PUT runs, once per visit.

### `docs/frontend screens.md` (+ `.docx`)

Screen 2.5 gains the third tab and its behaviour.

## 6. Edge cases & failure modes

- **The user leaves or is removed from a community.** Its posts drop off the list and the count (membership is part of the query). Their check rows stay. If the user rejoins, `joined_at` is new, so only posts from then on count.
- **A post is deleted.** It's gone from the list, and its check rows cascade. A PUT racing the delete gets `404`, which a background call ignores and Mark checked treats as "already gone": the card is removed with no error.
- **A community is deleted.** Its posts and checks cascade.
- **Two devices.** Checking on one device shows on the other at its next load. Checks are idempotent, so there's no conflict.
- **Undo after a rating or a save.** Not possible from this list, because those actions remove the card without Undo. A DELETE on a rated post would put it back on the list. That's accepted: only the Mark checked toast offers Undo.
- **An automatic check while offline or failing.** It's lost, and the post stays unchecked. Accepted (§2 out of scope).
- **Very old accounts with many communities.** The query is bounded by `community_checks_since`, so the list starts empty at launch.
- **Performance.** The query joins `community_members` on `(user_id)` and reads posts by `community_id`, using the existing feed index `(community_id, created_at desc, id desc)`, with a `NOT EXISTS` on the checks primary key. That's enough at this scale.

## 7. Test scenarios

**Unit (services, `communityChecks.service.test.ts`)**

- ✅ The list holds another member's post created after both joining and `community_checks_since`, newest first, with its community.
- ✅ It excludes: the user's own post, a direct recommendation, a post from before joining, a post from before `community_checks_since`, a checked post, and a post in a community the user left.
- ✅ Pagination: `PAGE_SIZE + 1` posts give a cursor, and the next page continues without a repeat.
- ✅ The count matches the list.
- ✅ Check is idempotent; Undo deletes the row and the post returns; Undo with no row is a no-op.
- ✅ Check on the user's own post is a no-op `200`.
- ❌ Check or Undo on a direct recommendation → `404`; on a non-member's post → `404`; on a missing post → `404`.
- ❌ A not-onboarded user → `403` on list, count, check and Undo.
- ❌ A malformed cursor → `422` (§9).
- ✅ `ratePost` on a community post writes the check; on a direct recommendation it doesn't.
- ✅ `saveBookmark` on a community post writes the check; `removeBookmark` leaves it.

**Integration (`communityChecks.integration.test.ts`)**

- ✅ `200` for the list, the count, PUT and DELETE, with the post leaving and returning.
- ❌ `422`: an unknown query key or a bad cursor; `404`: a malformed post id.
- ❌ `401` on all four without a session.
- ❌ `403` on all four for a not-onboarded user.
- ❌ `404`: PUT and DELETE on a missing post, a non-member's post, and a direct recommendation.
- ✅ Rating and saving through their real endpoints take the post off the list.

**Component**

- `Recommendations.test.tsx`:
  - ✅ The third pill shows the count, and its list renders cards with "in {community}".
  - ✅ Mark checked removes the card and the toast's Undo restores it.
  - ❌ A failed Mark checked brings the card back with an error toast.
  - ✅ The empty state; ❌ the error state with Try again; ✅ Mark checked disabled offline.
- `PostCard.test.tsx`:
  - ✅ Opening the main link on another member's community post calls the check.
  - ✅ It doesn't on the user's own post or on a direct recommendation.
- `PostDetail.test.tsx`:
  - ✅ Loading a community post by someone else calls the check once.
  - ✅ It doesn't on a direct recommendation.

**E2E**: none. This isn't a golden loop, and the integration tests prove the rule.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                              | Reason                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | One check row per post, not a per-community "seen up to" time                                                         | An older post can be checked while a newer one stays unchecked                                                                                           |
| 2026-11-22 | Clean start through `users.community_checks_since`                                                                    | Otherwise every existing post would flood every user's list at launch                                                                                    |
| 2026-11-22 | Rating and saving write the check on the server; opening a link or Post Detail writes it from the client              | The server sees the writes wherever they happen; only the client knows a link was opened                                                                 |
| 2026-11-22 | The pill reads "Communities · 4", not "From communities · 4"                                                          | Three pills share a 375px row; the longer label wraps to two lines                                                                                       |
| 2026-11-22 | Opening a link in the tab doesn't remove the card at once; it goes at the next load                                   | In the installed iPhone app the link first asks "Open in browser?" from inside the card (open-in-safari.md); removing the card would close that question |
| 2026-11-22 | A bad query or cursor is `422` and a malformed post id `404`, not `400`                                               | The shared `parseQuery`, `decodeCursor` and `parsePostId` answer that way on every list and post route                                                   |
| 2026-11-22 | `PostCard`'s Rate & Review shows on a community post (`direct === null`) as well as on a friend's direct one          | Before, the button assumed a direct item and would have shown "You're no longer friends" on a community card                                             |
| 2026-11-22 | In the installed iPhone app a link checks the post only when "Open in Safari" or "Copy link" is chosen, not on Cancel | `/code-review`: a tap followed by Cancel opened nothing                                                                                                  |
| 2026-11-22 | An admin or the owner keeps Delete post on this list, as in the feed                                                  | `/code-review`: the list first passed "not a moderator" for every post                                                                                   |
| 2026-11-22 | Accepted: Undo after switching pills restores the post on the server, but the list shows it only at the next visit    | `/code-review` corner case; the toast lasts 6 s, and fixing it would mean lifting the list's state to the screen                                         |
