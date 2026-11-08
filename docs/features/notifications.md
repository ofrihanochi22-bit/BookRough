# Feature: Notification center

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                   |
| ------------- | --------------------------------------------------------------------------------- |
| **Use cases** | **UC-21 (new): Notifications.** Touches UC-6, UC-7, UC-9, UC-11, UC-13 and UC-20. |
| **Phase**     | 6 — Step 6.1d of `DEVELOPMENT.md`, from manual-test notes **N1** and **N2** (§0)  |
| **Branch**    | `feat/notifications`                                                              |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                |

---

## 0. Where this comes from

Notes from the manual test session (`docs/manual-tests/2026-11-04.md` §7):

- **N1:** a recipient gets no sign that something new arrived.
- **N2:** an author should hear when their post is rated.

Today there are five notification **stubs** that only write a log line: `ratingNotification`, `recommendationNotification`, `friendNotification` (request and accepted) and `invitationNotification`. Each was written as "the single place a real channel plugs in". This feature is that channel: an in-app inbox. **N2 is folded into this feature** and won't be a feature of its own.

Decided in this spec session, 2026-11-08:

| #   | Question          | Decision                                                                                                                                                                                                              |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scope             | A general notification center, not a per-community badge.                                                                                                                                                             |
| D2  | Events in v1      | All five: a new community post, a direct recommendation received, my post rated, a friend request (received or accepted), and a community invitation. N5 (admin promotion) is **not** in v1. It's decided separately. |
| D3  | Entry point       | A bell in the Home header, beside Sign out. A badge on the **Home** tab counts unread notifications on every screen.                                                                                                  |
| D4  | Friends tab badge | It keeps only what **waits for your answer**: pending friend requests and invitations. Unseen recommendations leave it. The Recommendations row keeps its own count.                                                  |
| D5  | Read semantics    | **Per item.** Tapping one marks it read. **Mark all as read** marks the rest. Opening the screen changes nothing.                                                                                                     |
| D6  | Community posts   | **Grouped per community** while unread: "3 new posts in Friday Jazz". Once read, the next post opens a new one.                                                                                                       |
| D7  | Rating edits      | **The first rating only.** Changing a score notifies no one.                                                                                                                                                          |

## 1. Goal

When something happens that concerns you, a count appears on the Home tab. The bell on Home opens a list that says who did what, newest first. Tapping an item takes you there and marks it read. The author of a post finally hears that a friend rated it.

## 2. Scope

**In scope**

- A `notifications` table, written by the five event sites in place of their log-only stubs.
- `GET` list (paged), `GET` unread count, `POST` mark one read, `POST` mark all read.
- A **Notifications** screen (`/notifications`), the bell in the Home header, the Home-tab badge, and the Friends-tab badge narrowed (D4).
- Visibility rules, so a notification never reveals what its reader can no longer see (§6).
- UC-21 in `use cases`; the new table in `tables`; the new screen plus the Home and Friends changes in `frontend screens` (.md + .docx each). Also CLAUDE.md §6 (twelve tables, the new hand-written index) and §9 (UC-21), amendment notes in `rate-post.md`, `friend-requests.md`, `invite-friends.md`, `direct-recommendations.md` and `communities-create.md`, and `DEVELOPMENT.md` Step 6.1d.

**Out of scope**

- Push notifications, the iOS badge on the app icon, and email (no address is stored, §5). The PWA has no push channel yet.
- Real-time updates (WebSocket or SSE). The count refreshes on navigation, like the Friends badge today.
- N5 (admin promotion), notification settings or muting, and deleting a notification.
- A notification for a rating **change** (D7), a comment, a post deletion, a membership change, or anything else not in D2.
- Pruning old rows. At under 100 users a row is tiny, so this is noted as debt, not built.
- Visual design beyond the simplest placeholder (left to the planned redesign).

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_notifications`.

```prisma
enum NotificationType {
  COMMUNITY_POSTS      // grouped: count, latest poster as actor
  RECOMMENDATION       // a direct recommendation received
  RATING               // someone rated my post (first rating only)
  FRIEND_REQUEST       // someone sent me a request
  FRIEND_ACCEPTED      // someone accepted my request
  COMMUNITY_INVITATION // an admin invited me to a community
}

model Notification {
  id          String           @id @default(uuid()) @db.Uuid
  userId      String           @map("user_id") @db.Uuid       // the reader
  type        NotificationType
  actorId     String           @map("actor_id") @db.Uuid      // who did it (latest poster for COMMUNITY_POSTS)
  communityId String?          @map("community_id") @db.Uuid  // COMMUNITY_POSTS, COMMUNITY_INVITATION
  postId      String?          @map("post_id") @db.Uuid       // RECOMMENDATION, RATING
  count       Int              @default(1)                    // > 1 only for COMMUNITY_POSTS
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime         @default(now()) @map("updated_at") @db.Timestamptz(3) // bumped when a group grows; the list's order
  readAt      DateTime?        @map("read_at") @db.Timestamptz(3)

  user      User       @relation("NotificationReader", fields: [userId], references: [id], onDelete: Cascade)
  actor     User       @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  community Community? @relation(fields: [communityId], references: [id], onDelete: Cascade)
  post      Post?      @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([userId, updatedAt(sort: Desc), id(sort: Desc)])
  @@index([actorId])
  @@index([postId])
  @@index([communityId])
  @@map("notifications")
}
```

- **Hand-written in the migration (invisible to Prisma, like the existing ones):**
  - The partial unique index `notifications_one_open_group` on `(user_id, community_id) WHERE type = 'COMMUNITY_POSTS' AND read_at IS NULL`. There's at most one unread group per community, and it's the conflict target for the grouping upsert (§4.5).
  - The CHECK `notifications_count_positive` (`count >= 1`).
- **Cascades:** a deleted post, community, reader or actor takes its notifications with it. So a deleted post never leaves a dangling "rated your post".
- `users` gets no column. `recommendations_seen_at` stays, because the Recommendations row still uses it (D4).

## 4. API

Every endpoint requires auth and is in rate-limit tier 4 only (`global`). Responses use the standard shape. Every item goes through a `toPublicNotification` mapper, field by field (CLAUDE.md §5).

```ts
type PublicNotification = {
  id: string;
  type:
    | 'COMMUNITY_POSTS'
    | 'RECOMMENDATION'
    | 'RATING'
    | 'FRIEND_REQUEST'
    | 'FRIEND_ACCEPTED'
    | 'COMMUNITY_INVITATION';
  at: string; // updatedAt, ISO
  read: boolean;
  actor: { id: string; displayName: string; profilePictureUrl: string | null }; // the public profile fields that already exist
  community: { id: string; name: string } | null;
  post: { id: string; title: string | null } | null; // the converted title, or null
  count: number; // COMMUNITY_POSTS only; 1 otherwise
  score: number | null; // RATING: the rater's current score; null if their rating is gone
};
```

### `GET /api/notifications?before=`

- **Success `200`:** `{ items: PublicNotification[], nextCursor: string | null }`. The newest 20, ordered by `(updatedAt desc, id desc)`, with an opaque cursor in the same format as the feed's.
- **Visibility filter (§6):** `COMMUNITY_POSTS` and `COMMUNITY_INVITATION` rows show only when they still make sense to the reader. For `COMMUNITY_POSTS` that means the reader is still a member. For `COMMUNITY_INVITATION` it means the reader isn't banned. `RATING` and `RECOMMENDATION` rows show only while the post is visible to the reader (the same rule as Post Detail).
- **Errors:** `422` for a malformed cursor (the feed's rule), `401` when unauthenticated.

### `GET /api/notifications/unread-count`

- **Success `200`:** `{ count: number }`. Unread rows that pass the same visibility filter. Each group counts as **one**.
- **Errors:** `401`.

### `POST /api/notifications/:id/read`

- **Success `200`:** `{ notification: PublicNotification }`, now read. Idempotent: an already-read row is returned unchanged.
- **Errors:** `401`, and `404` "Notification not found." when the id is malformed (the posts rule), the row is missing, it **belongs to someone else**, or the reader can no longer see it (§6). These all look identical, so nothing leaks, and a row the reader can't see is never touched.

### `POST /api/notifications/read-all`

- **Success `200`:** `{ count: 0 }`. It sets `read_at = now()` on every unread row of the reader. Idempotent.
- **Errors:** `401`.

### 4.5 Writing notifications (`services/notification.service.ts`)

The five stubs become calls to one service. Every call runs **after** the event's own write has committed, in a `try/catch` that logs a `warn` and never fails the event, exactly as the stubs do today. Logs keep ids only.

| Event (existing call site)                                            | Row(s) written                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPost` saves a community post (converted, pending or link-only) | One raw-SQL statement: `INSERT … SELECT` over the community's members except the author, `ON CONFLICT (user_id, community_id) WHERE type='COMMUNITY_POSTS' AND read_at IS NULL DO UPDATE SET count = count + 1, actor_id = EXCLUDED.actor_id, updated_at = now()`. Prisma can't express a partial-index upsert. |
| `recommendation.service` sends a direct recommendation                | `RECOMMENDATION` for the recipient, with the actor (the sender) and the post.                                                                                                                                                                                                                                   |
| `rating.service` creates a rating (never on an edit, D7)              | `RATING` for the post's author, with the actor (the rater) and the post. Skipped if the author is the rater, which can't happen today but is guarded anyway.                                                                                                                                                    |
| `friend.service`: a request sent                                      | `FRIEND_REQUEST` for the addressee, with the actor (the requester).                                                                                                                                                                                                                                             |
| `friend.service`: a request accepted (either path)                    | `FRIEND_ACCEPTED` for the original requester, with the actor (the one who accepted).                                                                                                                                                                                                                            |
| `invitation.service` invites a friend                                 | `COMMUNITY_INVITATION` for the invitee, with the actor (the inviter) and the community.                                                                                                                                                                                                                         |

The four `*Notification.ts` stub files are removed. Their call sites `await` `notification.service` directly. Each writer catches its own errors (`writeSafely`) and logs a `warn`, so call sites need no wrapper. A `FRIEND_REQUEST` keeps at most one unread row per sender: sending again after cancelling refreshes it. Invitations notify only the rows `createManyAndReturn` actually created.

## 5. Screens & components

### 5.1 Home header: the bell

- A bell icon button sits left of **Sign out** in the "Your communities" row, at least 44×44px, with `aria-label` "Notifications" or "Notifications, n unread". It shows a small count dot when unread > 0, with "9+" above nine (the Friends badge's rule).
- It links to `/notifications`.

### 5.2 Bottom nav: the Home-tab badge

- The same badge style as Friends, on the **Home** tab, counting unread notifications. The accessible name is "Home, n unread".
- A new store `stores/notifications.ts` (`unread`, `refresh`, `setUnread`) is refreshed in `TabLayout` on load and navigation, next to the Friends store. A failed fetch keeps the last count.

### 5.3 Friends-tab badge (D4)

- `stores/friendRequests.ts` drops `unseen` from the tab's sum. The badge counts pending requests plus invitations only. The Recommendations row on the Friends screen keeps its unseen count, and Received still marks seen as today.

### 5.4 Notifications screen (`pages/Notifications.tsx`, route `/notifications` inside `TabLayout`)

- **Header:** a back link to Home, the heading "Notifications", and a **Mark all as read** button on the right. It's disabled when nothing is unread or when offline.
- **Rows**, newest first. Each row shows the actor's avatar (the existing `Avatar`, generated or Google), one line of text, and a relative time. Unread rows have a dot and a tinted background, and each row is a full-width touch target. The copy (the actor in bold):
  - `COMMUNITY_POSTS`: "**Dana** posted in Friday Jazz" when the count is 1, otherwise "**3 new posts** in Friday Jazz · latest from Dana". Opens `/communities/:id`.
  - `RECOMMENDATION`: "**Dana** sent you {title}", or "sent you a song" without a title. Opens `/recommendations`.
  - `RATING`: "**Noam** rated {title} 8/10", or "rated your post" without a title or score. Opens `/posts/:postId`.
  - `FRIEND_REQUEST`: "**Noam** sent you a friend request". Opens `/friends`.
  - `FRIEND_ACCEPTED`: "**Noam** accepted your friend request". Opens `/users/:actorId`.
  - `COMMUNITY_INVITATION`: "**Dana** invited you to Friday Jazz". Opens `/friends`, where invitations are answered.
- **Tap:** if the row is unread and the app is online, it calls `POST /:id/read` without waiting for it, updates the row and the store, then navigates. If the call fails, it's silent: the row stays unread on the server, and the badge corrects itself on the next navigation.
- **Paging:** a **Load more** button when `nextCursor` is set.
- **Loading:** skeleton rows. **Empty:** "No notifications yet" with "When friends post, rate or send you something, it shows up here." **Error:** the shared `LoadError` with Try again.
- **Offline:** the list reads from the cache once PR #40 lands, and Mark all as read is disabled with the existing offline note pattern. Tapping still navigates but marks nothing read.

## 6. Edge cases & failure modes

- **Left or removed from a community:** the community's `COMMUNITY_POSTS` rows disappear from the list and the count (the visibility filter), without deleting anything. If the user rejoins, they come back. Accepted.
- **Banned:** `COMMUNITY_INVITATION` rows for that community are filtered out.
- **The post was deleted:** the cascade removes `RATING` and `RECOMMENDATION` rows.
- **A recommendation hidden by the recipient:** its notification stays. It still opens Recommendations, where the item is gone. Accepted, because the badge is a hint.
- **Unfriended:** past notifications stay (direct items stay visible to both, UC-8).
- **A request withdrawn, ignored or already answered:** the row stays, and it opens Friends, which shows the current state.
- **Two posts at once in one community:** the upsert serialises on the partial unique index. The count becomes 2 and there's still one row.
- **A post while the reader's group was just read:** `read_at` is set, so the partial index no longer covers that row, and a new group starts at 1.
- **The notification write fails:** a `warn` is logged and the post, rating, request or invitation is still saved (§4.5).
- **Marking someone else's id:** `404`, the same as a missing one.
- **A count race:** an item arriving between loading the list and Mark all as read is marked read unseen. Accepted, as on Recommendations.

## 7. Test scenarios

**Unit (services):** `notification.service.test.ts`

- ✅ `notifyCommunityPost` writes one row per member except the author.
- ✅ A second post groups: count 2, the actor updated, `updatedAt` bumped, still one row.
- ✅ After the group is read, the next post starts a new row at count 1.
- ✅ The `RECOMMENDATION`, `RATING`, `FRIEND_REQUEST`, `FRIEND_ACCEPTED` and `COMMUNITY_INVITATION` writers each write the right type, reader, actor and target.
- ❌ A rating by the author themselves writes nothing.
- ✅ `list` is newest first by `updatedAt` and paged with a cursor. `toPublicNotification` exposes only the listed fields.
- ✅ `list` and `countUnread` hide `COMMUNITY_POSTS` from a former member and `COMMUNITY_INVITATION` from a banned user, and they come back when the user rejoins.
- ✅ `countUnread` counts a group as one and ignores read rows.
- ✅ `markRead` sets `readAt` and is idempotent. `markAllRead` reads every row.
- ❌ `markRead` on someone else's id → `AppError` 404. On a missing id → 404.
- ❌ A malformed cursor → `AppError` 422.
- ✅ A second friend request from the same sender refreshes the unread row instead of adding one.
- ❌ `markRead` on a row the reader can no longer see → 404, and the row stays unread.

**Unit (event sites):**

- ✅ `createPost` (community) calls the post writer. A direct recommendation calls the recommendation writer instead.
- ✅ `rateDirect`/`ratePost` on create calls the rating writer. ❌ A rating edit doesn't.
- ✅ A friend request sent, and an accept by either path, call their writers. An invitation calls its writer.
- ❌ A writer that throws: the event still succeeds, and a `warn` is logged.

**Integration (endpoints):** `notifications.integration.test.ts`

- ✅ `200` list after a real post, rating, recommendation, request, accept and invitation through the API: six rows with the right copy fields.
- ✅ `200` unread-count. ✅ `200` mark one read, after which the count drops. ✅ `200` read-all, after which the count is 0.
- ❌ `422` for a malformed cursor. ❌ `404` for a non-UUID id.
- ❌ `401` on all four endpoints without a cookie.
- ❌ `404` marking another user's notification, and for an unknown id.
- ❌ Visibility: removed from a community → its post group is gone from the list and the count.
- ✅ A deleted post → its rating notification is gone (cascade).

**Component** (Vitest + RTL)

- `Notifications.test.tsx`:
  - ✅ The skeleton.
  - ✅ The empty state.
  - ✅ Rows: each of the six types' copy and link. A group shows "3 new posts".
  - ✅ Tapping an unread row marks it read and navigates.
  - ❌ The mark call fails → it still navigates, and the row stays unread.
  - ✅ Load more.
  - ✅ Mark all as read clears the dots and the store.
  - ❌ It's disabled with nothing unread and when offline.
  - ❌ A load error → `LoadError`, and Try again reloads.
- `Dashboard.test.tsx`: ✅ the bell links to `/notifications` and its accessible name carries the count.
- `BottomNav` and `TabLayout` tests: ✅ the Home badge shows the unread count. ✅ The Friends badge no longer adds unseen recommendations.

**E2E** (golden loop, extended)

- Two users in one community: A posts, then B sees the Home badge, opens the bell, taps "A posted in …", and lands on the feed with the badge cleared. B rates A's post, then A sees "B rated … n/10".

## 8. Open questions

None at approval. **UC-21 is a new use-case number** (like UC-20), so approving this spec approves adding it.

## 9. Decisions log

| Date       | Decision                                                                                                                                                                                                                       | Reason                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 2026-11-08 | D1–D7 (§0)                                                                                                                                                                                                                     | Developer's choices in the spec session.                                                         |
| 2026-11-08 | N2 folded into this feature                                                                                                                                                                                                    | The rating event is one of the five (D2).                                                        |
| 2026-11-08 | Visibility filtered at read time, not by deleting on leave or ban                                                                                                                                                              | One rule in one query. No change to the membership services, and nothing to resurrect on rejoin. |
| 2026-11-08 | The rating notification shows the rater's **current** score, joined from `ratings`                                                                                                                                             | No stale snapshot. Edits don't notify (D7), but they still show correctly.                       |
| 2026-11-08 | A raw-SQL upsert for community posts                                                                                                                                                                                           | Prisma can't target a partial unique index. One statement fans out to every member.              |
| 2026-11-08 | `/code-review`: requests deduped per sender, invitations notify only created rows, `markRead` respects visibility, the cursor helpers moved to `utils/cursor.ts` (no import cycle), the badge decrements from the latest count | Review findings, all fixed in this PR.                                                           |
| 2026-11-08 | No pruning in v1                                                                                                                                                                                                               | Under 100 users, so the table stays small. Recorded as debt.                                     |
