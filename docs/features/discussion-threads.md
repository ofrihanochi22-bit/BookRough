# Feature: Discussion threads on a post

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                   |
| ------------- | --------------------------------------------------------------------------------- |
| **Use cases** | **UC-22 (new): Discuss a recommendation.** Touches UC-16 (Post Detail) and UC-21. |
| **Phase**     | 6 — Step 6.1i of `DEVELOPMENT.md`, from manual-test note **N3** (§0)              |
| **Branch**    | `feat/discussion-threads`                                                         |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                |

---

## 0. Where this comes from

Note **N3** of the manual test session (`docs/manual-tests/2026-11-04.md` §7) asks for a discussion on every recommendation: replies to a review, replies to replies, and so on. In a community, the discussion is open to the whole community. Today Post Detail shows the ratings, each with an optional review, and nobody can answer one.

Decided in this spec session, 2026-11-08/09:

| #   | Question        | Decision                                                                                                                                                                                 |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where it starts | **On the post and on a review.** Anyone who can see the post may comment on it without rating, or reply to someone's review.                                                             |
| D2  | Depth           | **One flat thread under each opener** (a post comment or a review), in time order. A reply to a reply joins the same thread, labelled "↩ to Dana".                                       |
| D3  | Notifications   | **Only the person replied to.** Grouped per post while unread, for example "3 new replies on Blue", through the existing notification center.                                            |
| D4  | Edit and delete | **Like posts.** The author edits (marked "· edited") and deletes. A community's admins and owner delete any comment there. A deleted comment that has replies becomes "Comment deleted". |

## 1. Goal

Friends talk about a song where it's shared. Someone answers a review ("you'd love their live version"), the reviewer answers back, and a member who only wants to say something can comment without rating. Everyone replied to hears about it from the bell.

## 2. Scope

**In scope**

- A `comments` table, plus endpoints to list, add, edit and delete comments on a post.
- On **Post Detail**:
  - a "Discussion" with a composer for a post comment;
  - each rating with a review gets **Reply** and its thread;
  - each post comment gets **Reply** and its thread.
- A comment count on the feed card's footer ("· 3 comments").
- A new notification type, `COMMENT_REPLY`, grouped per (reader, post) while unread.
- Docs:
  - a new **UC-22** in `use cases`, `tables` (`comments`, `NotificationType`), and `frontend screens` (3.4 Post Detail, 3.1 the card), all .md + .docx;
  - CLAUDE.md §6 and §9;
  - amendment notes in `post-detail.md`, `notifications.md` and `direct-recommendations.md`.

**Out of scope**

- Nested trees, quoting, mentions with autocomplete, reactions or likes, attachments, links previews, markdown.
- Comments anywhere but Post Detail (the feed only shows the count).
- Real-time updates. The discussion refreshes when Post Detail opens or a comment is sent.
- Paging. A post's whole discussion loads at once; at friend-group scale that's small. Revisit if a post passes about 200 comments.
- An admin-area moderation view. Community admins delete in place.
- Visual design.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_comments`.

```prisma
model Comment {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  postId      String    @map("post_id") @db.Uuid
  authorId    String    @map("author_id") @db.Uuid
  /// Set on a reply under a review (D1): the thread is that rating's.
  ratingId    String?   @map("rating_id") @db.Uuid
  /// Set on a reply under a post comment: the thread's opener.
  parentId    String?   @map("parent_id") @db.Uuid
  /// Whom a reply answers, for "↩ to Dana" and the notification (D2, D3).
  replyToId   String?   @map("reply_to_id") @db.Uuid
  body        String?   // null once deleted with replies kept ("Comment deleted")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  editedAt    DateTime? @map("edited_at") @db.Timestamptz(3)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(3)
  post        Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  author      User      @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  rating      Rating?   @relation(fields: [ratingId], references: [id], onDelete: Cascade)
  parent      Comment?  @relation("Thread", fields: [parentId], references: [id], onDelete: Cascade)
  replies     Comment[] @relation("Thread")
  replyTo     User?     @relation("CommentReplyTo", fields: [replyToId], references: [id], onDelete: SetNull)

  @@index([postId, createdAt])
  @@index([ratingId])
  @@index([parentId])
  @@index([authorId])
  @@map("comments")
}
```

- **Three kinds of row:**
  - A post comment, with `rating_id` and `parent_id` both null.
  - A reply under a review, with `rating_id` set.
  - A reply in a post comment's thread, with `parent_id` set, always pointing at a post comment and never at a reply (the thread stays flat, D2).
- **Hand-written in the migration:**
  - the CHECK `comments_one_thread` (`num_nonnulls(rating_id, parent_id) <= 1`);
  - the CHECK `comments_body_or_deleted` (`body IS NOT NULL OR deleted_at IS NOT NULL`).
  - Both are invisible to Prisma, like the existing ones.
- **Cascades:**
  - A post's deletion takes its discussion. A rating's deletion takes its thread (a removed member's ratings are deleted, UC-14).
  - A comment's hard delete takes its thread's replies. That only happens to an opener with no replies (§4), so in practice it's a leaf.
- `notifications`: `NotificationType` gains **`COMMENT_REPLY`**. It uses `post_id` and `count`, with the latest replier as the actor. A second hand-written partial unique index, `notifications_one_open_reply_group`, on `(user_id, post_id) WHERE type = 'COMMENT_REPLY' AND read_at IS NULL`, groups them like community posts.

## 4. API

Every endpoint requires auth and a finished profile, and sits in rate-limit tier 4. Who may **read and write** is Post Detail's rule (`checkPostAccess`): a current member of the post's community, or one of a direct item's two people. **Writing on a direct item also needs current friendship**, the same as a rating. Comments are serialised field by field:

```ts
type PublicComment = {
  id: string;
  author: MemberUser;
  body: string | null; // null when deleted
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  ratingId: string | null; // thread under this review
  parentId: string | null; // thread under this post comment
  replyTo: MemberUser | null;
  isMine: boolean;
  canDelete: boolean; // author, or a community admin/owner
};
```

### `GET /api/posts/:postId/comments`

- **Success `200`:** `{ comments: PublicComment[] }`, all of the post's comments, oldest first. The client groups them into threads.
- **Errors:** `401`, `403` mid-onboarding, and `404` "Post not found." (a malformed or unknown id, or no access).

### `POST /api/posts/:postId/comments`

- **Request:** `{ body: string, ratingId?: string, parentId?: string, replyToId?: string }`, `.strict()`. The body is cleaned with the post-comment rules (NFC, trimmed, line breaks kept), 1–500 graphemes.
- **Rules:**
  - At most one of `ratingId` and `parentId`.
  - `ratingId` must be a rating **with a review** on this post.
  - `parentId` must be a **post comment** (not a reply) on this post that isn't deleted.
  - `replyToId`, when given, must be someone already in that thread (the opener's author or a reply's author). Otherwise it's dropped silently and the opener's author is used.
- **Success `201`:** `{ comment: PublicComment }`.
- **Notification (D3):** after the commit, never failing the comment. The reader is:
  - `replyToId` if given;
  - else the review's author, for a reply under a review;
  - else the post comment's author, for a reply in its thread;
  - else the post's author, for a post comment.

  The commenter themselves is never notified.

- **Errors:**
  - `401`; `403` mid-onboarding; `403` "You can only comment on songs from friends." on a direct item after unfriending.
  - `404` "Post not found."; `404` "That comment is gone." for a deleted or unknown `parentId`, or a `ratingId` with no review.
  - `422` for an empty body, over 500 graphemes, both thread ids, or an unknown key.

### `PATCH /api/comments/:commentId`

- **Request:** `{ body: string }`. It's cleaned the same way. An unchanged body writes nothing (no "· edited").
- **Author only.** On a direct item, only while the two are friends.
- **Success `200`:** `{ comment: PublicComment }`.
- **Errors:** `401`; `403` "Only the author can do this."; `403` (friendship, as above); `404` for a deleted, unknown or unreachable comment; `422`.

### `DELETE /api/comments/:commentId`

- **Who:** the author, or an admin or owner of the post's community. On a direct item, only the author.
- **What it does:**
  - A **post comment** with replies is soft-deleted: `body = null`, `deleted_at` set, and it shows as "Comment deleted".
  - Anything else is removed outright. A soft-deleted opener whose last reply is deleted is removed too.
- **Success `200`:** `{ deleted: 'removed' | 'hidden' }`.
- **Errors:** `401`; `403` "Only the author or an admin can delete this."; `404`.

### Changes to existing endpoints

- `PublicPost` gains **`commentCount`**: comments that aren't deleted, one `_count` per page.
- The notification visibility rule (`notifications.md` §4) covers `COMMENT_REPLY` like `RATING`: shown while the post is visible to the reader.

### Logging

`info` `{ userId, postId, commentId }` on create, edit and delete, plus `deletedBy: 'author' | 'admin'` on delete. **Never the body.**

## 5. Screens & components

### 5.1 Post Detail — "Discussion" (below the ratings summary)

- **The composer:** "Add a comment" textarea (n/500), with **Send**. It's disabled offline, with the note "You're offline. Connect to comment." (PR #40's pattern).
- **The list:** one stream of openers, oldest first. These are each **rating with a review** (as today: name, score, review, time) and each **post comment** (name, text, time).
  - Under each opener, its thread: replies in time order, indented once, each showing "↩ to Dana" when it answers someone other than the opener's author.
- **Reply** on an opener or a reply opens an inline composer in that thread, prefilled as answering that person ("Replying to Dana · Cancel").
- **⋯ on a comment:** Edit (the author), and Delete (the author, or a community admin).
  - **Edit** turns the text into an inline editor (Save / Cancel).
  - **Delete** asks "Delete this comment?" first.
- **States:**
  - A skeleton while loading.
  - An empty state, "No comments yet. Start the conversation."
  - A load error, "Couldn't load the discussion." with Try again. The card and the ratings stay.
  - A send error shows inline under the composer and keeps the draft.
  - A direct item after unfriending shows "You're no longer friends with {name}" in place of the composer, the same as for rating.

### 5.2 Feed card

- The summary line gains the count: "7.5 · 4 ratings · 3 comments". It's links to Post Detail as today, and hidden at 0.

### 5.3 Notifications screen

- `COMMENT_REPLY`: "**Noam** replied to you on Blue", or "**3 new replies** on Blue · latest from Noam". It opens `/posts/:postId`.

## 6. Edge cases & failure modes

- **Replying to a comment deleted meanwhile:** `404` "That comment is gone.", and the discussion reloads.
- **A review edited to blank** after replies exist: the thread stays under the rating, which still exists.
- **Removed from the community:** the member's comments stay, credited to them like posts after leaving. A removal deletes their posts and ratings (and so threads under their reviews). Their post comments elsewhere in the community stay. This matches how posts outlive leaving (accepted).
- **Two people replying at once:** both are kept, in time order.
- **A notification for someone who can no longer see the post:** filtered at read time, as for ratings.
- **A very long discussion:** everything loads at once (out of scope, §2).
- **An offline user:** sees the discussion that was last loaded (PR #40), and can't write.

## 7. Test scenarios

**Unit (services):** `comment.service`

- `create`:
  - ✅ A post comment, a reply under a review, and a reply in a post-comment thread with `replyTo`.
  - ✅ The notification reader for each kind.
  - ❌ No self-notify.
  - ❌ An empty body or over 500 graphemes → 422. Both thread ids → 422.
  - ❌ A rating without a review, an unknown parent, a deleted parent, or a reply as parent → 404.
  - ❌ No access → 404. A direct item after unfriending → 403. Mid-onboarding → 403.
  - ✅ An unknown `replyToId` falls back to the opener's author.
- `list`: ✅ oldest first, mapped field by field. ✅ A deleted opener shows `body: null`. ✅ `canDelete` for author and admin. ❌ No access → 404.
- `edit`:
  - ✅ Changes the body and sets `editedAt`. ✅ An unchanged body writes nothing.
  - ❌ Not the author (an admin included) → 403.
  - ❌ Deleted → 404. ❌ A direct item after unfriending → 403.
- `delete`:
  - ✅ A leaf is removed. ✅ An opener with replies is hidden.
  - ✅ The last reply under a hidden opener removes the opener.
  - ✅ A community admin may delete.
  - ❌ Another member → 403. ❌ On a direct item only the author may.
- `notifyCommentReply`: ✅ creates, ✅ groups while unread, ✅ restarts after it's read.

**Integration (endpoints)**

- **GET:** ✅ 200 with all three kinds, grouped. ❌ 401, 404 for a non-member, 404 for a malformed id.
- **POST:**
  - ✅ 201 for each kind, and the reader's unread count goes up.
  - ❌ 422 for an empty body, an over-long body, both ids, or an extra key.
  - ❌ 404 for a non-member or a deleted parent.
  - ❌ 403 on a direct item after unfriending. ❌ 401.
- **PATCH:** ✅ 200 marks it edited. ❌ 403 for someone else. ❌ 404 once deleted. ❌ 422. ❌ 401.
- **DELETE:**
  - ✅ 200 `removed` and 200 `hidden`. ✅ An admin can delete.
  - ❌ 403 for another member. ❌ 404. ❌ 401.
- **Feed:** ✅ `commentCount` excludes deleted comments.
- **Cascades:** ✅ deleting the post removes its discussion, and removing a member deletes the threads under their reviews.

**Component**

- Post Detail discussion:
  - ✅ Renders openers with their threads and the "↩ to" label.
  - ✅ The composer sends and appends. ❌ A send error keeps the draft.
  - ✅ Reply opens the inline composer for that person.
  - ✅ Edit saves inline. ✅ Delete confirms and removes or hides.
  - ❌ Offline disables writing. ❌ A load error offers Try again.
  - ✅ The empty state. ✅ After unfriending, the note replaces the composer.
- PostCard: ✅ "· 3 comments", hidden at 0.
- Notifications: ✅ `COMMENT_REPLY` copy, and the group copy.

**E2E** (extends the golden loop): A posts, B comments, A sees "B replied to you" in the bell and opens it, and A replies to B in the thread.

## 8. Open questions

None. **UC-22 is a new use-case number**, so approving this spec approves adding it.

## 9. Decisions log

| Date       | Decision                                                   | Reason                                                                               |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-11-09 | D1–D4 (§0)                                                 | Developer's choices in the spec session.                                             |
| 2026-11-09 | Writing on a direct item needs friendship; reading doesn't | The rating rule (direct-recommendations.md). After unfriending, nothing new is said. |
| 2026-11-09 | A comment body is up to 500 graphemes, not the post's 280  | A conversation needs a little more room than a one-line caption.                     |
| 2026-11-09 | Tier 4 only, like ratings                                  | Writing needs access to a friend's post, and tier 3 is already shared.               |
| 2026-11-09 | No paging in v1                                            | Friend-group scale. Revisit past about 200 comments on a post.                       |
| 2026-11-09 | A new UC-22 rather than amending UC-16                     | Discussion is a capability of its own, with its own writes and notifications.        |
