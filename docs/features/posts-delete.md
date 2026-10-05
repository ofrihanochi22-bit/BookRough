# Feature: Posts — delete a post

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                  |
| ------------- | -------------------------------------------------------------------------------- |
| **Use cases** | UC-18 (delete a post), extended with an admin path                               |
| **Phase**     | 3 — Step 3.5 of `DEVELOPMENT.md` (absorbs former 3.5 and the delete menu of 3.6) |
| **Branch**    | `feat/posts-delete`                                                              |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged               |

---

## 1. Goal

The author of a post can delete it from the feed, with UC-18's confirmation, and it is gone for everyone. A community's admins and its owner can delete any post in their community the same way — which closes the gap `posts-feed.md` left open, where a member who leaves keeps their posts in the feed and nobody could remove them.

## 2. Scope

**In scope**

- `DELETE /api/posts/:postId` — the author, or an admin or the owner of the post's community.
- `PublicPost.canDelete`, computed by the server for the viewer.
- A ⋯ menu on post cards the viewer may delete, with a confirmation sheet.
- UC-18 amended with the admin path.
- Doc updates (§9).

**Out of scope** — deliberately

- Soft delete, undo, a trash: deletion is final (UC-18 "permanently deleted").
- Telling the author their post was deleted: the app sends no notifications (CLAUDE.md §5), and in-app notifications are not a UC.
- A moderation log or reason. The server logs who deleted which post (Pino); nothing is shown in the app.
- Deleting from the app-wide admin area (UC-19): it stays read-only (`admin-panel.md` §2).
- Editing a post.
- Bulk deletion. Removing a member already deletes all their posts (`posts-feed.md` §3.3).
- Ratings and bookmarks: they arrive in Phase 4 and will cascade from `posts` (`tables.md`), which is what makes UC-18's "deletes all ratings and comments" true then.

## 3. Data model changes

None. The `posts` cascades from `posts-feed.md` §3 stay as they are; Phase 4's `ratings` and `bookmarks` will declare `ON DELETE CASCADE` from `posts`.

## 4. API

All responses use the CLAUDE.md §4 envelope.

### `DELETE /api/posts/:postId`

- **Auth:** signed in; a member of the post's community; and either the post's author or an `ADMIN` / `OWNER` of that community (developer's choice, option A). An admin may delete **any** post there — a member's, a fellow admin's, the owner's, or an ex-member's (developer's choice, option A).
- **Request:** no body.
- **Success:** `200 { data: null }`. The row is deleted.
- **Errors:**
  - `401` signed out.
  - `404` "Post not found." — unknown or malformed id, already deleted, or the caller is not a member of the post's community (same answer, so a stranger learns nothing).
  - `403` "Only the author or an admin can delete this post." — a plain member who is not the author.
- **Races:** the delete is a `deleteMany` by id; if it matches nothing (deleted meanwhile by someone else, or by a removal), the answer is `404`. The permission check reads the caller's role just before; a demotion landing in between is not re-checked (the window is milliseconds, and the result — a post an admin was allowed to delete a moment earlier — is acceptable).
- **Logging:** `info` `{ userId, communityId, postId, byAuthor }`. No titles, URLs or comments.

### `PublicPost.canDelete`

`canDelete: boolean` joins `PublicPost` (`utils/publicPost.ts`): true when the viewer is the author or an admin/owner of the community. `GET /posts` computes it from the role `requireMember` already read; `POST /posts` and the retry return it as `true` (the caller is the author). The client never mirrors the role rule.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 `PostCard` — the ⋯ menu

- A **⋯** button ("Post options") in the card header, shown only when `canDelete`.
- It expands inline under the header (the Community Settings pattern — no popover primitive), with one action: **Delete post**.
- Offline: the action is disabled (the existing banner explains why).

### 5.2 Confirmation (`Sheet`)

- **Your own post** (UC-18): title "Delete post"; "Are you sure you want to delete this recommendation? This will also delete all ratings and comments associated with it." → **Delete** / **Cancel**.
- **Someone else's post** (admin): "Delete {author}'s recommendation? This will also delete all ratings and comments on it. {author} won't be notified." → **Delete** / **Cancel**.
- While deleting: **Delete** busy ("Deleting…"), the sheet not dismissible.
- Success: the sheet closes, the card disappears from the feed at once, toast "Post deleted".
- Network failure or `5xx`: inside the sheet, "Could not delete post. Check your connection and try again." (UC-18); the post stays.
- `404` (already gone): the sheet closes, the card disappears, toast "This post was already deleted."
- `403` (no longer allowed — demoted meanwhile): the message inside the sheet, and the feed reloads so the menu reflects the new role.

### 5.3 Feed

`CommunityFeed` removes a deleted post from whichever list holds it (first page, a loaded "more" page, or your own new posts), using the same latest-state update as feature 1. A post deleted elsewhere simply disappears on the next load (no live updates).

## 6. Edge cases & failure modes

- **Two people delete the same post** (author and an admin): the second gets `404` → "This post was already deleted."
- **The author is removed while their delete is in flight:** the removal deletes the post too → `404` → same as above.
- **Deleting a pending post while its author retries the conversion:** the retry re-reads the post, finds nothing → `404` → the card asks the feed to reload (feature 1 behaviour).
- **An admin is demoted with the menu open:** the server answers `403`; the sheet shows it and the feed reloads.
- **The caller is removed from the community with the menu open:** `404` "Post not found." → treated like "already deleted"; their next feed load gets the community's `404` → not-found page.
- **The community is deleted meanwhile:** `404`, as above.
- **An ex-member's post:** visible to members, `canDelete` only for admins and the owner.
- **Malformed id:** `404`, never `422`.

## 7. Test scenarios

**Unit (`services/post.service.ts`, `utils/publicPost.ts`)**

- ✅ `deletePost`: the author deletes their post; an admin deletes a member's post; the owner deletes an admin's post; an admin deletes the owner's post; an admin deletes an ex-member's post.
- ❌ `deletePost`: a plain member, not the author → `403`; the caller not a member → `404`; unknown post → `404`; the delete matching nothing (deleted meanwhile) → `404`.
- ✅ `toPublicPost` `canDelete`: author → true; admin/owner viewer → true; member viewer → false; the key set grows by exactly `canDelete`.

**Integration (endpoint)**

- ✅ `200` author; `200` admin on a member's post; `200` owner on an admin's post; `200` admin on an ex-member's post — the row is gone in each case.
- ❌ `401` signed out; `403` plain member on someone else's post; `404` stranger, unknown id, malformed id, already deleted.
- ✅ `GET /posts` sends `canDelete` per viewer (member sees it only on their own posts; admin on all).
- ✅ After a delete, `GET /posts` no longer lists the post and the retry endpoint answers `404`.

**Component (Vitest + RTL)**

- ✅ The ⋯ menu shows only when `canDelete`; it expands to **Delete post**.
- ✅ Own post → UC-18 text; someone else's → "Delete {author}'s recommendation?…".
- ✅ Confirm → busy "Deleting…", then the card leaves the feed and "Post deleted" is toasted.
- ❌ Network failure → UC-18 error in the sheet, the post stays; `404` → removed with "This post was already deleted."; `403` → message and the feed reloads.
- ❌ Offline → **Delete post** disabled.
- ✅ The feed removes a deleted post from a "Load more" page and from your own just-posted ones.

**E2E (Playwright)**

- ✅ Golden loop: B posts twice; B deletes one of their own (UC-18 confirmation) → gone for A too; A (owner) deletes B's other post with the admin confirmation → gone for B. Both projects.

## 8. Open questions & risks

- **No dependencies added. No schema change.**
- UC-18's confirmation promises that ratings and comments go too; that becomes true when Phase 4 adds them with cascades.

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: UC-18 — admins and the owner can delete any post in their community, with their own confirmation; the author is not notified; already-deleted handling.
- `docs/frontend screens.md` + `.docx`: 3.1 — the ⋯ menu and confirmations replace "arrives with Step 3.5".
- `posts-feed.md`: `canDelete` added to `PublicPost`; Merged ticked.
- `DEVELOPMENT.md`: Step 3.5 per §13.

## 10. Decisions log

| Date       | Decision                                                                             | Reason                                                                 |
| ---------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 2026-10-05 | The author, plus the community's admins and owner, can delete (option A)             | Closes the gap of ex-members' posts; matches the existing admin powers |
| 2026-10-05 | Admins may delete any post in their community, whatever the author's role (option A) | Simple and predictable; works for ex-members, who have no role         |
| 2026-10-05 | `canDelete` computed by the server                                                   | One source of the permission rule; the client never mirrors roles      |
| 2026-10-05 | Hard delete, no undo; the author is not notified                                     | UC-18 says permanent; the app sends no notifications                   |
| 2026-10-05 | The ⋯ menu expands inline under the card header                                      | Same pattern as Community Settings; no popover primitive               |
| 2026-10-05 | An admin deleting someone else's post sees "{author} won't be notified"              | Honest about what happens, since nothing tells the author              |
