# Feature: Post Detail and feedback

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Use cases** | UC-16 (view a post's ratings); UC-13 extended (edit your rating); UC-14 amended (removal) |
| **Phase**     | 4 — Step 4.4 of `DEVELOPMENT.md` (see `bookmarks-my-list.md` §0)                          |
| **Branch**    | `feat/post-detail`                                                                        |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                        |

---

## 1. Goal

Every member sees how a recommendation landed: the feed card shows the average score and how many people rated it, and **View ratings** opens a Post Detail screen with the song, the average, and every member's rating — name, score, comment and when. A member who rated a post can edit their rating there. Removing a member now also removes their ratings in that community, so an admin can clear abusive feedback the same way they clear abusive posts.

## 2. Scope

**In scope**

- `PublicPost.ratingSummary` (average and count) on every post (§4).
- `GET /api/posts/:postId` (the post) and `GET /api/posts/:postId/ratings` (the ratings), separately, so the card can show while the ratings fail (UC-16's fail path) (§4).
- `PATCH /api/posts/:postId/rating` — edit your own rating (developer's choice, option B).
- Removal deletes the removed member's ratings in that community (option C); UC-14 amended; the removal confirmation's line.
- The Post Detail screen at `/posts/:postId`, and the **View ratings** entry on feed cards (§5).
- Schema: `ratings.updated_at` (§3).
- Doc updates (§9).

**Out of scope** — deliberately

- Rating from Post Detail or the feed: rating stays on My List (rate-post.md, option A). Post Detail shows "You rated n/10" with Edit, or nothing, for the viewer.
- Hiding ratings until you have rated (option A: always visible).
- Deleting your own rating; an admin deleting a single rating. Removal is the moderation tool (option C).
- An "edited" marker (developer's choice: left out).
- A notification on edit; replies to ratings; reactions; sorting or filtering the list.
- Paging the ratings list: friend groups are small; the list loads whole.
- Ratings from people who **left** are shown as usual, with no marker.
- Visual design: placeholders from existing primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --create-only --name add_rating_updated_at` (checked, applied, drift-checked; `ratings_score_range` and `community_members_one_owner` untouched).

```prisma
model Rating {
  // …existing fields
  /// Set on every edit; equal to createdAt until then. Not shown.
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
}
```

The `@default(now())` fills existing rows. No other schema change: the existing unique index `(post_id, user_id)` serves "the ratings of a post".

### 3.1 Removal deletes ratings (UC-14)

`removeMember` deletes the target's ratings on posts of that community **in the same transaction** as their posts, the membership and the ban. Permanent: unblocking does not restore them. Leaving (`DELETE /members/me`) deletes nothing — the leaver's ratings stay and are shown as usual.

## 4. API

All responses use the CLAUDE.md §4 envelope. A malformed or unknown post id, or a post in a community the caller is not currently in, gets `404` "Post not found."

### Shapes

```ts
PublicPost {
  // …existing fields, plus:
  ratingSummary: { average: number | null; count: number };  // average to one decimal; null when count is 0
}

PublicPostRating {                 // utils/publicPostRating.ts, field by field
  id: string;
  rater: MemberUser;               // id, displayName, profilePictureUrl
  isMine: boolean;
  score: number;
  comment: string | null;
  createdAt: string;
}
```

- `ratingSummary` is computed for every post a response carries (feed, retry, create, My List, Post Detail) with one `groupBy` per page, not one query per post. On My List, a post from a community the viewer is no longer in carries `{ average: null, count: 0 }`: ratings are for current members only (§6).
- The average is rounded half-up to one decimal on the server (`7.25` → `7.3`).

### `GET /api/posts/:postId`

- **Auth:** current member of the post's community.
- **Success:** `200 { post: PublicPost, community: { id: string, name: string } }`.
- **Errors:** `401`; `404`.

### `GET /api/posts/:postId/ratings`

- **Auth:** current member.
- **Behaviour:** every rating on the post, newest first; the summary alongside, from the same rows.
- **Success:** `200 { ratingSummary: { average, count }, ratings: PublicPostRating[] }`.
- **Errors:** `401`; `404`.

### `PATCH /api/posts/:postId/rating`

Edit your own rating.

- **Auth:** current member of the post's community, who has rated the post.
- **Request:** `{ score?: number, comment?: string | null }`, `.strict()`, at least one key. Same rules as creating: `score` an integer 1–10 ("Choose a score from 1 to 10."); `comment` ≤ 280 graphemes after cleaning, blank → `null`.
- **Success:** `200 { rating: PublicPostRating }`.
- **Errors:** `400` unparseable JSON; `401`; `404` "Post not found." (unknown / malformed / deleted post, or not a member); `404` "You haven't rated this post." (a member with no rating); `422` bad score, comment too long, empty body, unknown key.
- No notification on edit.

### Changes to existing endpoints

- `DELETE /api/communities/:id/members/:userId` — also deletes the target's ratings in that community (§3.1). Response unchanged.
- Every endpoint returning `PublicPost` — gains `ratingSummary`.

### Logging

`info` `{ userId, postId, score }` "Rating edited". `removeMember`'s existing line gains `ratingsDeleted`. No comments.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Feed card (`PostCard`)

- Under the song: when `count > 0`, "★ {average} · {count} rating(s)"; otherwise nothing.
- A **View ratings** link to `/posts/:postId` (UC-16's "dedicated button"), on every card. The title also links there (UC-16's "tap the post body"); the Open and Other services buttons do not.

### 5.2 Post Detail (`pages/PostDetail.tsx`, route `/posts/:postId`, inside the tab layout)

1. "← {community name}" back to the community.
2. The `PostCard` for the post, as in the feed: Open in your service, Other services, the ⋯ delete menu when allowed (deleting returns to the community), the bookmark or "You rated n/10". Its own View ratings link is hidden here.
3. **The average**, large: "7.5" with "out of 10 · 4 ratings"; "No ratings yet" when there are none.
4. **The ratings list**, newest first: avatar, name ("You" for yours), "8/10", the comment (line breaks kept), relative time. Your own row has **Edit**.
   - **Edit** opens the rating sheet (`RatingSheet`) pre-filled with your score and comment, titled "Edit your rating", submitting "Save changes". `200` → the sheet closes, "Rating updated", the list and the average reload. `404` (post gone or access lost) → the not-found page. `422` / network → inline, draft kept, as when rating.

States:

- **Loading:** the card skeleton and three rating-row skeletons.
- **Post not found / not a member / deleted:** the standard not-found page.
- **Ratings fail to load** (UC-16): "Could not load comments at this time." with **Try again**; the card and the average area stay as they are (the average from the card's `ratingSummary`).
- **Offline:** Edit disabled; what was loaded stays readable.

### 5.3 Community Settings

The removal confirmation becomes: "They won't be able to rejoin until an admin unblocks them. Their posts and ratings in this community will be deleted too."

## 6. Edge cases & failure modes

- **A rater leaves** → their ratings stay, shown as usual, counted in the average.
- **A rater is removed** → their ratings in that community are deleted with the removal; averages drop them. Unblocking does not restore them.
- **The post is deleted while Post Detail is open** → the next action (Edit, reload) answers `404` → the not-found page.
- **The viewer loses access while on Post Detail** → the same.
- **Editing in two tabs** → the last write wins; each response is the current rating.
- **Edit with nothing changed** → allowed (`200`), the row unchanged except `updated_at`.
- **Edit to a score outside 1–10** → `422`; the database `CHECK` backs it.
- **No ratings** → "No ratings yet"; the card shows no average.
- **A post with many ratings** → loaded whole; a friend group's community is small. Revisit if a community grows past a few hundred members.
- **Average rounding** → half-up to one decimal, computed on the server only.
- **Privacy:** ratings are visible to current members of the post's community only; no endpoint lists a user's ratings across communities.

## 7. Test scenarios

**Unit (services and serialisers)**

- ✅ `ratingSummary`: average to one decimal (7.25 → 7.3), count; `null` average at zero ratings; one `groupBy` for a page of posts.
- ✅ `listPostRatings`: newest first; `isMine` per viewer; the summary matches the rows.
- ❌ `listPostRatings` / `getPost`: unknown post → `404`; non-member → `404`.
- ✅ `editRating`: score only, comment only, both; blank comment → `null`.
- ❌ `editRating`: no rating → `404` "You haven't rated this post."; non-member / unknown post → `404`; bad score / long comment / empty body → `422`.
- ✅ `removeMember` deletes the target's ratings in that community only (their ratings elsewhere and others' ratings stay); leave deletes none.
- ✅ `toPublicPostRating`: exact key set; rater has exactly the three `MemberUser` fields.

**Integration (Supertest, scraper mocked)**

- ✅ `GET /posts/:id` → the post and its community; `GET /posts/:id/ratings` → newest first with names, `isMine`, the summary.
- ✅ The feed's `ratingSummary` matches after three ratings (e.g. 6, 7, 9 → 7.3, 3).
- ✅ `PATCH /posts/:id/rating` → `200`; the list and the summary reflect it.
- ❌ `GET` both → `401`; `404` stranger, unknown, malformed, deleted post, after leaving.
- ❌ `PATCH` → `400`; `401`; `404` no rating; `404` stranger / after leaving / deleted post; `422` score 0, 11, 7.5, comment 281, `{}`, unknown key.
- ✅ Removal deletes the removed member's ratings here and keeps their ratings elsewhere; leaving keeps them; unblocking does not restore them.
- 🔒 Rating rows carry exactly `PublicPostRating`'s keys; the rater carries exactly three keys.

**Component (Vitest + RTL)**

- ✅ PostCard: "★ 7.5 · 4 ratings" when rated, nothing when not; View ratings and the title link to `/posts/:id`.
- ✅ PostDetail: skeletons; the card, the average and the list ("You" on yours, with Edit); "No ratings yet".
- ✅ PostDetail Edit: the sheet pre-filled, "Save changes" sends the changes, "Rating updated", the list reloads.
- ❌ PostDetail: post `404` → not-found page; ratings failure → "Could not load comments at this time." with Try again (the card stays); edit `422` / network → inline, draft kept; offline → Edit disabled.
- ✅ PostDetail: deleting the post from its ⋯ menu returns to the community.
- ✅ Community Settings: the removal confirmation's new line.

**E2E (Playwright, scraper stand-in)** — the golden loop's "see the feedback" step

- ✅ B rates A's post 8 with a comment (via My List); A opens the feed → "★ 8 · 1 rating" → **View ratings** → B's name, 8/10 and the comment; B opens Post Detail → Edit → 9 → "Rating updated" and the average reads 9.

## 8. Open questions & risks

- None at approval. Performance is the watch item: the summary is one grouped query per page; the ratings list is unpaged by design (§6).

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `ratings` — `updated_at`; removal deletes the removed member's ratings in that community.
- `docs/use cases.md` + `.docx`: UC-16 — the entry points, always visible to members, the separate failure of the ratings, editing your own; UC-13 — a rating can be edited from Post Detail; UC-14 — removal deletes their ratings too.
- `docs/frontend screens.md` + `.docx`: 3.1 (the average and View ratings), 3.3 (the removal line), 3.4 Post Detail (its layout, Edit, and states).
- `communities-membership.md` / `posts-feed.md`: the removal line's new wording; `rate-post.md`: Merged ticked, "a rating is final" superseded.
- `DEVELOPMENT.md`: Step 4.4's entry per §13, and Phase 4 marked complete.

## 10. Decisions log

| Date       | Decision                                                                                                       | Reason                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2026-10-05 | Removal deletes the removed member's ratings in that community; leaving keeps them (option C)                  | One rule for all of a member's content; admins clear abusive feedback by removing                  |
| 2026-10-05 | Ratings always visible to members (option A)                                                                   | Exactly UC-16; the feedback is the app's social value                                              |
| 2026-10-05 | You can edit your own rating from Post Detail (option B); no "edited" marker                                   | Fix typos and update opinions, reusing the rating sheet                                            |
| 2026-10-05 | Post and ratings are two requests                                                                              | UC-16's fail path: the card stays while the comments fail                                          |
| 2026-10-05 | `ratingSummary` on every `PublicPost`, one grouped query per page; average half-up to 1 decimal                | The feed card shows the average without N+1 queries; one rounding rule, on the server              |
| 2026-10-05 | The ratings list loads whole, newest first                                                                     | Friend groups are small                                                                            |
| 2026-10-05 | No notification on edit                                                                                        | The stub announces a new rating; an edit is a correction                                           |
| 2026-10-05 | `ratings.updated_at` added, not shown                                                                          | Records edits for support; no "edited" marker by decision                                          |
| 2026-10-05 | Stage 2: one `requirePostMember` helper (post exists, caller a member now) for every post-scoped rating action | The same lookup was about to appear four times; one place keeps the 404 rule identical             |
| 2026-10-05 | Stage 3: My List sends no live rating summary for a community the viewer left                                  | `/security-review` note: an ex-member kept seeing current averages, against §6's members-only rule |
