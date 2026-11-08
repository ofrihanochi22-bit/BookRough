# Feature: Edit a post's comment

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                      |
| ------------- | -------------------------------------------------------------------- |
| **Use cases** | UC-11 and UC-20, amended: the author may edit their own comment      |
| **Phase**     | 6 — Step 6.1e of `DEVELOPMENT.md`, from manual-test note **N7** (§0) |
| **Branch**    | `feat/edit-post-comment`                                             |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged   |

---

## 0. Where this comes from

Note **N7** of the manual test session (`docs/manual-tests/2026-11-04.md` §7). The ⋯ menu on your own post offers only **Delete post**, and the developer suggested **Edit**, at least for the comment. Editing was deliberately out of scope in `posts-feed.md` §2, `posts-delete.md` §2, `link-only-posts.md` §2 and `direct-recommendations.md` §2. This spec amends all four.

Decided in this spec session, 2026-11-08:

| #   | Question       | Decision                                                                                                                       |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | What is edited | **The comment only.** The link, the song and the conversion never change, so ratings and saves keep pointing at the same song. |
| D2  | Marker         | **"· edited"** next to the post's time, for everyone, once the comment has changed (`comment_edited_at`).                      |

## 1. Goal

An author who mistyped, or wants to add a line, fixes their comment in place. Nobody has to delete a post that friends have already rated and saved. Readers can see that the comment changed.

## 2. Scope

**In scope**

- Editing, adding or clearing the comment of **your own** post: a community post, or a direct recommendation you sent.
- An **Edit comment** item in the ⋯ menu wherever the author sees their post (the feed, Post Detail, Recommendations → Sent).
- The "· edited" marker on the card and on Post Detail.
- Amendment notes in the four specs above, `use cases` UC-11 and UC-20, and the `posts` table in `tables` (.md + .docx). In `frontend screens`, the Community Feed and Post Detail entries (.md + .docx).

**Out of scope**

- Changing the link, the song or a link-only post's platform (D1). Delete and post again instead.
- An admin editing someone else's comment. Admins may delete, as today, but never put words in someone's mouth.
- An edit history, or showing the old text.
- A notification on edit (the notification center stays at its five events).
- Visual design beyond the simplest placeholder.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_post_comment_edited_at`.

- `posts.comment_edited_at` — `TIMESTAMPTZ(3)`, **nullable**, no default. Set when a save actually changes the comment. Null means the comment was never edited. It's serialised as `commentEditedAt`.

No index: it's only ever read together with its post.

## 4. API

### `PATCH /api/posts/:postId/comment`

- **Auth:** required. **The author only.**
- **Request:** `{ comment: string | null }`, `.strict()`. It's cleaned with the shared rules (`checkPostComment`: NFC, trimmed, line breaks kept, blank runs collapsed, at most 280 graphemes), and blank or `null` clears it.
- **Behaviour:**
  - The caller must still reach the post (`requirePostAccess`). For a community post that means a current member, and for a direct item one of its two people.
  - The caller must be its **author**.
  - For a **direct recommendation**, the sender and recipient must still be **friends**. That's the same rule as a rating edit (direct-recommendations.md §3), because after unfriending nothing new can be said.
  - If the cleaned comment equals the stored one, nothing is written and `comment_edited_at` stays as it is. Otherwise it saves the comment and sets `comment_edited_at = now()`.
- **Success `200`:** `{ post: PublicPost }`. The updated post, in the same shape as the feed's, with its ratings summary.
- **Errors:**
  - `401` when unauthenticated.
  - `404` "Post not found." for a malformed or unknown id, or when the caller can't reach the post. That includes an author who left the community, the same as a conversion retry.
  - `403` "Only the author can do this." for someone else's post, an admin included.
  - `403` "You can only edit songs you sent to friends." for a direct item after unfriending.
  - `422` "Comments can be up to 280 characters." for a comment that's too long, and `422` for an unknown key or a wrong type.
  - `403` "Finish your profile first." for a caller who hasn't finished onboarding.
- **Rate limit:** tier 4 only. No Chromium is involved.
- **Logging:** `info` `{ userId, postId }` "Post comment edited". Never the text.

### `PublicPost`

- It gains `commentEditedAt: string | null`.

## 5. Screens & components

### 5.1 The ⋯ menu (`PostCard`, Post Detail, Sent)

- For the author, the menu lists **Edit comment** above **Delete post**. An admin who isn't the author still sees only Delete post.
- On a direct item the sender sees Edit comment only while the two are friends (`isFriend`), the same rule as rating.

### 5.2 `EditCommentSheet` (new)

- **Title:** "Edit comment". It holds a textarea with the current comment, the same counter as the composer ("n/280"), and **Cancel** / **Save**.
- **Save** is disabled while nothing has changed, while the text is too long, or while offline. Offline it shows the note "You're offline. Connect to edit." (PR #40's pattern).
- **Busy:** "Saving…". The sheet can't be dismissed while it saves.
- **Success:** the toast "Comment updated". The card, or Post Detail, shows the returned post, including "· edited".
- **Errors:** a `422` shows inline under the textarea and keeps the draft. A `403` or `404` shows a toast with the server's message, closes the sheet, and refreshes the list.

### 5.3 The marker

- Next to the relative time on the card and on Post Detail: "2h · edited" when `commentEditedAt` is set. On Post Detail it carries a `title` with the edit time.

## 6. Edge cases & failure modes

- **Saved unchanged** (the same text, or only whitespace differences that clean to the same text): `200`, no write, no marker.
- **Cleared:** the comment becomes `null`, the marker is set, and the card shows no comment but "· edited".
- **The post was deleted while the sheet was open:** `404`, a toast, and the list refreshes.
- **The author was removed from the community meanwhile:** `404`. Their posts are deleted on removal anyway.
- **Unfriended while the sheet was open:** `403`, a toast, and the sheet closes.
- **Unfriended at the same instant as a save:** the friendship check is a plain read, like a rating edit's, so an edit can land a moment after unfriending. Accepted, to match the rating edit (`/code-review`, recorded rather than changed).
- **Two tabs saving at once:** the last write wins. Accepted, since it's one author.

## 7. Test scenarios

**Unit (services):** `post.service` `editComment`

- ✅ The author changes the comment: it's saved, `commentEditedAt` is set, and the result is mapped.
- ✅ The author clears it: it becomes `null` and the marker is set.
- ✅ The same text after cleaning: no update call, the marker unchanged.
- ✅ A direct item between friends: saved.
- ❌ Not the author, a member or an admin: `403` AUTHOR_ONLY.
- ❌ A direct item after unfriending: `403`.
- ❌ An unknown post, or no access: `404`.
- ❌ Too long: `422`, before any read.
- ❌ Mid-onboarding: `403`.

**Integration (endpoints)**

- ✅ `200` for a community post: the feed then shows the new comment and `commentEditedAt`.
- ✅ `200` for a direct item as the sender: Received shows it.
- ❌ `400`/`422` for an unknown key, a number, or a 281-grapheme comment.
- ❌ `401` without a cookie.
- ❌ `403` for another member, the community's admin, the recipient of a direct item, and the sender after unfriending.
- ❌ `404` for an unknown id, a malformed id, a non-member, and an author who left.

**Component**

- `EditCommentSheet`:
  - ✅ Prefilled.
  - ✅ The counter.
  - ✅ Save disabled until changed.
  - ✅ Saves, toasts and returns the post.
  - ❌ Too long → Save disabled.
  - ❌ A server `422` → shown inline, draft kept.
  - ❌ A `404` → a toast and close.
  - ❌ Offline → disabled with the note.
- `PostCard`:
  - ✅ The author sees Edit comment.
  - ❌ An admin non-author doesn't.
  - ❌ A direct sender doesn't after unfriending.
  - ✅ "· edited" shows when `commentEditedAt` is set.
- `PostDetail`: ✅ Edit comment updates the page in place.

**E2E:** none. This isn't a golden loop, and integration plus component tests cover it (CLAUDE.md §10).

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                                                   | Reason                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 2026-11-08 | D1, D2 (§0)                                                                                                                                | Developer's choices in the spec session.                                      |
| 2026-11-08 | Author only; admins can't edit                                                                                                             | Moderation is deletion. Editing would put words in someone else's mouth.      |
| 2026-11-08 | A direct item's comment needs current friendship                                                                                           | The same rule as a rating edit after unfriending (direct-recommendations.md). |
| 2026-11-08 | An unchanged save writes nothing                                                                                                           | So "· edited" never appears for a no-op.                                      |
| 2026-11-08 | `/code-review`: one read for access and text, the log only on a real update, the marker outside `<time>`; the unfriend race recorded in §6 | Review findings.                                                              |
| 2026-11-08 | `PATCH /posts/:postId/comment`, not `PATCH /posts/:postId`                                                                                 | The one editable field is explicit, so no other column can ever be edited.    |
