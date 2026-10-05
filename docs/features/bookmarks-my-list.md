# Feature: Bookmarks and My List

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                     |
| ------------- | ----------------------------------------------------------------------------------- |
| **Use cases** | UC-12 (save to Listen Later); UC-13's My List screen, without rating; UC-14 amended |
| **Phase**     | 4 — Step 4.1 of `DEVELOPMENT.md` (re-sliced, §0)                                    |
| **Branch**    | `feat/bookmarks-my-list`                                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged                  |

---

## 0. How Phase 4 was re-sliced

`DEVELOPMENT.md` split Phase 4 by layer: schema (4.1), routes (4.2), notification stub (4.3), all UI (4.4), tests (4.5). None of those could merge alone under CLAUDE.md §11. They become three PRs (decided 2026-10-05, option A), each with its own spec session:

| #   | Feature                   | Former steps                                                               | Spec            |
| --- | ------------------------- | -------------------------------------------------------------------------- | --------------- |
| 1   | **Bookmarks and My List** | 4.1 (bookmarks), 4.2 (bookmark routes), 4.4 (icon, My List)                | this document   |
| 2   | Rate a post               | 4.1 (ratings), 4.2 (rating route), 4.3, 4.4 (rating modal, ghost bookmark) | its own session |
| 3   | Post Detail and feedback  | 4.2 (ratings list), 4.4 (Post Detail, average)                             | its own session |

Step 4.3 (the notification stub) merges into feature 2: on its own it has no screen. Step 4.5 dissolves: every feature ships its own tests (§15).

## 1. Goal

A member taps the bookmark icon on a friend's post in a community feed, sees "Added to Listen Later", and finds the song on the **My List** tab — until now a "Coming soon" screen. My List shows everything they saved, newest first, with each song's community, and opens each one in their own streaming service. They can remove a song from the list there or by tapping the icon again in the feed. Bookmarks are private: nobody else learns what you saved.

## 2. Scope

**In scope**

- Schema: the `bookmarks` table (§3).
- Endpoints: save, un-save, list my bookmarks (§4); `PublicPost.isBookmarked`.
- The bookmark icon on `PostCard` in the feed (not on your own posts), optimistic with rollback (UC-12).
- The My List screen replacing the tab's Coming soon placeholder, with Load more, Remove, and its loading, empty, error and offline states.
- UC-14 amended: a removed member keeps the songs they had saved (§3.2).
- Doc updates (§9) and the Phase 4 re-slice in `DEVELOPMENT.md`.

**Out of scope** — deliberately

- Ratings, the "Rate & Review" button, the Submit Rating modal, removing a bookmark on rating, the "post was deleted" ghost row and its message — feature 2 (UC-13).
- The average rating, Post Detail — feature 3 (UC-16).
- Any visibility of bookmarks to others: no "Saved by n", no list of savers, no notification to the author (developer's choice, option A).
- Bookmarking your own post (developer's choice, option A): no icon, and the server refuses.
- Bookmark counts in the admin area's activity columns.
- Grouping or filtering My List by community, sorting options, search.
- Offline reading of My List — arrives with the service worker in Phase 6 (CLAUDE.md §16). Offline, saving and removing are disabled.
- Visual design: every visual choice is a placeholder from existing tokens and primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_bookmarks` (created with `--create-only`, the SQL inspected, then applied; drift checked with `prisma migrate diff`; the partial index `community_members_one_owner` untouched).

### 3.1 `bookmarks`

```prisma
/// A post saved to its user's Listen Later list (UC-12,
/// docs/features/bookmarks-my-list.md §3). Private to that user.
model Bookmark {
  userId    String   @map("user_id") @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@id([userId, postId])
  @@index([userId, createdAt(sort: Desc), postId(sort: Desc)])
  @@index([postId])
  @@map("bookmarks")
}
```

- Composite primary key: a post is saved at most once per user, which makes saving idempotent.
- The first index serves My List: one user's bookmarks, newest saved first, keyset-paginated. The second serves the cascade when a post is deleted (the primary key starts with `user_id`, so it cannot).
- Cascades: deleting the post (by its author or an admin, UC-18; with its community; with a removed member's posts, UC-14) or the user's account deletes the bookmark.
- `ratings` is **not** added here; it arrives with feature 2.

### 3.2 Bookmarks outlive membership

A bookmark is kept, and still listed and openable in My List, after its user **leaves** the community (developer's choice, option A) **or is removed from it** (option A). Removal deletes the removed member's own posts (posts-feed §3.3), not their bookmarks on other people's posts. UC-14's post-condition "loses access to its feed and shared music" is amended accordingly: they lose the feed; songs they had already saved stay in their My List.

Consequences:

- **Saving** needs current membership of the post's community. **Removing** a bookmark does not — you can always clear a song from a community you left.
- My List shows the community's name even for a community you left (you saw it as a member). It does not link to that community's page when you are no longer a member.
- If the post itself is deleted, the bookmark goes with it (cascade), including when its author is removed from the community.

## 4. API

All responses use the CLAUDE.md §4 envelope. A malformed or unknown post id, or a post in a community the caller is not in, gets `404` "Post not found." (as in posts-delete).

### Shapes

```ts
PublicPost {
  // …every field from posts-feed.md §4 and posts-delete.md §4, plus:
  isBookmarked: boolean;   // the viewer saved it; computed for the viewer only
}

SavedPost {                 // utils/savedPost.ts, field by field
  savedAt: string;          // the bookmark's created_at
  community: { id: string; name: string };
  isMember: boolean;        // the viewer is still in that community
  post: PublicPost;         // canDelete false unless the viewer moderates that community today
}
```

- `isBookmarked` is added to `toPublicPost` explicitly; no count of savers exists anywhere in the API.
- The feed's query (`listPosts`) and the retry response read the viewer's bookmark with the post (one `include` filtered to the viewer); `createPost` returns `isBookmarked: false`.

### `PUT /api/posts/:postId/bookmark`

Save a post to Listen Later. `PUT` because it is idempotent: saving twice is one bookmark.

- **Auth:** signed in, a current member of the post's community, and not its author.
- **Request:** no body.
- **Success:** `200 { status: 'success', data: null }` — also when it was already saved.
- **Errors:** `401`; `404` "Post not found." (unknown or malformed id, a deleted post, or not a member); `403` "You can't save your own post." (the caller is the author).

### `DELETE /api/posts/:postId/bookmark`

Remove a post from Listen Later.

- **Auth:** signed in. **No membership check** (§3.2): the caller only ever deletes their own row.
- **Request:** no body.
- **Success:** `200 { status: 'success', data: null }` — also when there was no bookmark, or the post no longer exists (idempotent; nothing to leak, since the caller learns nothing about posts they never saved).
- **Errors:** `401`; `404` "Post not found." only for a malformed id (not a UUID).

### `GET /api/users/me/bookmarks?before=<cursor>`

My List.

- **Auth:** signed in.
- **Behaviour:** the caller's bookmarks, newest saved first, 20 per page. `before` is an opaque cursor (base64url of the bookmark's `createdAt` + `postId`) from the previous page's `nextCursor`. Bookmarks from communities the caller has left are included (§3.2).
- **Success:** `200 { items: SavedPost[], nextCursor: string | null }`.
- **Errors:** `401`; `422` "The request query is invalid." for a malformed cursor (the feed's cursor format and message, reused).

### Changes to existing endpoints

- `GET /api/communities/:id/posts`, `POST /api/posts/:postId/conversion` — each post gains `isBookmarked`.
- `POST /api/communities/:id/posts` — the new post has `isBookmarked: false`.
- Leaving or removal — unchanged; bookmarks are not touched (§3.2).

### Logging

`info` `{ context: 'bookmark', userId, postId, action: 'save' | 'remove' }`. Nothing about the post's content.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Bookmark icon on `PostCard` (feed)

- Shown on every card in the feed **except your own posts**, pending posts included. An icon button: outline when not saved (`aria-label="Save to Listen Later"`, `aria-pressed="false"`), filled when saved (`aria-label="Remove from Listen Later"`, `aria-pressed="true"`). It reuses the tab bar's bookmark shape. (Since rate-post.md: not on posts you rated either — "You rated n/10" takes its place.)
- **Optimistic (UC-12):** tapping flips the icon at once and sends the request; the button ignores taps while its request is in flight.
  - Save succeeds → toast "Added to Listen Later".
  - Remove succeeds → toast "Removed from Listen Later".
  - Network failure or `5xx` → the icon reverts and a toast shows "Failed to save. Please check your connection and try again." (for a removal: "Failed to remove. Please check your connection and try again.").
  - `404` (the post was deleted, or you lost access) → the icon reverts, the toast "This post is no longer available.", and the feed reloads.
- The new state is recorded in the feed's local changes (`replaced`) against the latest state, so Load more or a concurrent retry does not undo it (the `CommunityFeed` functional-update pattern).
- Offline → the button is disabled (the existing offline banner explains).

### 5.2 My List (`pages/MyList.tsx`, route `/my-list`)

Replaces the `ComingSoon` placeholder inside the tab layout. Heading "My List", subtitle "Songs you saved to listen later."

- **List:** one card per saved song, newest saved first. A compact card (`components/SavedPostCard.tsx`), reusing `PostCard`'s pieces where they fit: cover art (placeholder tile when pending or on image error), title (or "Shared from {service}" when pending), artist, the "Album" label, "Shared by {author} in {community}", and the saved time ("Saved 2h ago").
  - **Main action:** "Open in {your service}" — the same rule as the feed (`lib/postLinks`): your service's link, else the original.
  - **Remove** (secondary): removes at once (optimistic), toast "Removed from Listen Later"; on failure the card comes back and the failure toast from §5.1 shows.
  - The community's name links to its page while `isMember`; after you left, it is plain text.
  - No "Rate & Review" yet (feature 2), no ⋯ delete menu, no comment.
- **Load more** at the bottom while `nextCursor` exists; failure → inline Try again under the list.
- **Loading:** three card skeletons.
- **Empty:** "Nothing saved yet" / "Tap the bookmark on a friend's song to save it here."
- **Load error:** `LoadError` "Couldn't load your list." with Try again.
- **Offline:** the banner "You're offline. Connect to change your list."; Remove disabled; whatever was loaded stays readable.

### 5.3 Tab bar

My List stops being "Coming soon". The `BottomNav` comment is updated; Search stays Coming soon (Phase 5).

## 6. Edge cases & failure modes

- **Double tap / two tabs** saving the same post → one row (composite key); both requests `200`.
- **Removing what is not there** (already removed in another tab, or the post was deleted) → `200`; the card leaves My List.
- **The post is deleted while on My List** → still shown until the next load; Open still works (external link); Remove → `200` and the card leaves. The ghost-row message belongs to feature 2, where rating is what reveals it.
- **The post is deleted while the feed is open**, then the icon is tapped → `404` → revert, toast, feed reload.
- **The saver leaves or is removed** → the bookmark stays and is listed with `isMember: false`; Remove still works; saving anything else from that community → `404`.
- **The author leaves** → the post stays (posts-feed §3.2) and so do bookmarks on it. **The author is removed** → their posts are deleted, and with them everyone's bookmarks on those posts.
- **The community is deleted** → its posts cascade, and every bookmark on them.
- **The saver rejoins** → nothing changes; their bookmarks never left.
- **Saving your own post** via the API → `403`; the UI never offers it.
- **A user whose account is deleted** → their bookmarks cascade.
- **Malformed `postId`** → `404`; **malformed `before`** → `422`.
- **The viewer is now an admin of a community they bookmarked from** → `canDelete` on that `SavedPost.post` is computed as in the feed; My List still shows no delete menu.
- **Privacy:** no endpoint returns another user's bookmarks or a count; `toPublicPost` gains only the viewer's own `isBookmarked`.

## 7. Test scenarios

**Unit (services and serialisers)**

- ✅ `bookmark.service.saveBookmark`: a member saves another member's post → row; saving again → still one row, no error.
- ❌ `saveBookmark`: own post → `403`; non-member → `404`; unknown post → `404`.
- ✅ `removeBookmark`: removes the row; ✅ no row → resolves quietly; ✅ works after the user left the community.
- ✅ `listBookmarks`: newest saved first, 20 per page, the cursor continues without gaps or duplicates (equal timestamps tie-broken by post id); ✅ includes a post from a community the user left with `isMember: false`; ✅ never includes another user's bookmarks.
- ❌ `listBookmarks`: malformed cursor → `422`.
- ✅ `toPublicPost`: `isBookmarked` per viewer; exact key set (existing test extended).
- ✅ `toSavedPost`: exact key set; community has exactly `id` and `name`.
- ✅ `listPosts` / `retryConversion` return `isBookmarked` for the caller only (another member's bookmark does not show).
- ✅ Leaving and removal leave the leaver's / removed member's bookmarks in place; removal still deletes their own posts and with them others' bookmarks on those posts.

**Integration (Supertest, scraper mocked)**

- ✅ `PUT /posts/:id/bookmark` → `200`, row exists; again → `200`, one row; the feed then shows `isBookmarked: true` for the saver and `false` for others.
- ❌ `PUT` → `401` signed out; `403` own post; `404` non-member, unknown id, malformed id, deleted post.
- ✅ `DELETE /posts/:id/bookmark` → `200`, row gone; again → `200`; after leaving the community → `200`.
- ❌ `DELETE` → `401`; `404` malformed id.
- ✅ `GET /users/me/bookmarks` → newest saved first with community and `isMember`; pages with `nextCursor`; after leaving, still listed with `isMember: false`; after removal, still listed.
- ❌ `GET` → `401`; `422` malformed cursor.
- ✅ A deleted post disappears from the saver's list; a deleted community's posts disappear from it.
- 🔒 No payload contains another user's bookmark, a saver count, or keys beyond `PublicPost` / `SavedPost`.

**Component (Vitest + RTL, toasts mocked)**

- ✅ PostCard: outline icon on others' posts, none on your own; tap → filled at once and "Added to Listen Later"; tap a filled icon → outline and "Removed from Listen Later".
- ❌ PostCard: save fails (network) → reverts and shows the UC-12 message; `404` → reverts, "This post is no longer available.", and the feed reloads; offline → disabled.
- ✅ CommunityFeed: a saved state survives a Load more that lands meanwhile.
- ✅ MyList: skeletons while loading; cards with title, artist, "Shared by … in …", "Open in {your service}" (fallback to the original); Load more appends; the community links while a member and is plain text after leaving.
- ✅ MyList: empty state; Remove → card gone and toast.
- ❌ MyList: load error with Try again; Remove fails → card returns with the failure toast; offline → banner, Remove disabled.

**E2E (Playwright, scraper stand-in)** — the golden loop's "save for later" step

- ✅ B saves A's post in the feed → "Added to Listen Later"; the My List tab shows it with "Open in {B's service}"; Remove → "Nothing saved yet". A sees no bookmark icon on their own post.

## 8. Open questions & risks

- None at approval. Feature 2 inherits two decisions from here: bookmarks outlive membership (it decides whether a non-member may rate a post they saved), and own posts are never in My List.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `bookmarks` — `created_at` as `timestamptz`, the My List index, cascades, privacy, survives leaving and removal.
- `docs/use cases.md` + `.docx`: UC-12 — not on your own posts, un-saving, the `404` path, privacy; UC-14 — a removed member keeps the songs they had saved.
- `docs/frontend screens.md` + `.docx`: 3.1 Community Feed (the bookmark icon); 4.1 My List (this feature's half; "Rate & Review" arrives with feature 2).
- `DEVELOPMENT.md`: the Phase 4 re-slice and this step's entry per §13.
- CLAUDE.md: nothing changes (ten tables already counted).

## 10. Decisions log

| Date       | Decision                                                                                     | Reason                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-05 | Phase 4 re-sliced into three PRs: bookmarks + My List, rate, Post Detail (option A)          | Vertical slices (§11); each PR follows one UC                                          |
| 2026-10-05 | Step 4.3's notification stub goes with rating (feature 2); Step 4.5 dissolves                | A log line has no screen; every feature ships its own tests                            |
| 2026-10-05 | Bookmarks survive leaving a community and stay openable (option A)                           | Developer's choice: never lose a saved song                                            |
| 2026-10-05 | Bookmarks also survive removal (option A); UC-14's "shared music" wording amended            | Developer's choice over UC-14's original wording: one rule for leaving and removal     |
| 2026-10-05 | No bookmarking your own post (option A): no icon, `403`                                      | My List is "songs friends recommended to me"; feature 2 never meets self-rating        |
| 2026-10-05 | Bookmarks are private: no counts, no names (option A)                                        | No social pressure; least data leaving the server                                      |
| 2026-10-05 | `PUT` / `DELETE /posts/:id/bookmark`, both idempotent; `DELETE` needs no membership          | Double taps and two tabs are harmless; a left community's songs can still be cleared   |
| 2026-10-05 | Optimistic icon with rollback and a toast                                                    | UC-12's fail path; a toast survives a feed reload (Phase 3 lesson)                     |
| 2026-10-05 | My List: one flat list, newest saved first, 20 per page, keyset cursor, community name shown | Simplest list that still says where a song came from                                   |
| 2026-10-05 | Pending posts can be saved; they open the original link                                      | Same as the feed; nothing about saving depends on the conversion                       |
| 2026-10-05 | Stage 2: a `post_id` index on `bookmarks`                                                    | Deleting a post cascades by `post_id`, which the `(user_id, post_id)` key cannot serve |
| 2026-10-05 | Stage 2: My List reuses the feed's cursor encoding and its `422` message                     | One cursor format; the spec's "Invalid cursor." wording was never used anywhere else   |
