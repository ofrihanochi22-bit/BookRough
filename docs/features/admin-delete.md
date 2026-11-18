# Feature: The admin deletes a user or a community

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| **Use cases** | UC-19 amended (admin area); UC-21 amended (a new notification)                  |
| **Phase**     | 6 — DEVELOPMENT.md Step 6.1z2                                                   |
| **Branch**    | `feat/admin-delete`                                                             |
| **Status**    | ☑ Spec approved (2026-11-18) · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

Today the admin area lists users and communities read-only (CLAUDE.md §17). After this ships, the admin can delete a user or a community from those lists: a **Delete** button on each row opens an **"Are you sure?"** dialog that says what will be lost, and nothing happens until the admin confirms. This reverses a fixed decision, so CLAUDE.md §17 and `docs/features/admin-panel.md` are amended in the same PR.

## 2. Scope

**In scope**

- A Delete button on each row of Admin → Users and Admin → Communities.
- An "Are you sure?" confirmation dialog for each, with the consequences spelled out (§5).
- **Deleting a user is a full, hard delete** (decision D1): the existing cascades remove their posts, ratings, comments, bookmarks, friendships, invitations, bans, notifications, avatar and memberships. That includes **other people's replies** in a thread under the deleted user's review or comment, because `comments` cascades from its parent.
- **Communities the user owns are handed over, not lost** (D2): ownership passes to the community's longest-standing `ADMIN`, or, if there is none, its longest-standing `MEMBER` (by `community_members.joined_at`, ties by `user_id`). The new owner gets the existing `COMMUNITY_OWNER` notification. A community in which the deleted user is the only member is deleted.
- **Deleting a community** reuses the owner's existing delete (cascades; no undo), with the admin's authorisation instead of the owner's.
- **Every member of a deleted community is notified** (D5), including its owner: a new notification type, `COMMUNITY_REMOVED` — "**Jazz** was removed by an admin."
- One structured log line per deletion (admin id, target id, counts), like the admin's photo removal. Ids only, no names.

**Out of scope**

- **Deleting an `ADMIN`**, including oneself (D4). The button is not shown on an admin's row, and the server refuses with `403`. Removing an admin stays a database operation, like granting the role (§17).
- **Blocking re-registration** (D3). A deleted user who chooses "Create account" again with the same Google account gets a new, empty account. Nothing about them is kept after deletion: no hash, no block list.
- Soft delete, undo, a grace period, or an archive of what was deleted.
- Telling the deleted user or their friends anything. The app has no email (§5), and the deleted user's session ends on its next request (`requireAuth` re-reads the user row).
- Notifying members when the deletion of a _user_ removes a sole-member community. There is no one left to tell.
- Suspending, editing or renaming users or communities. Delete is the only new write.
- A "type the name to confirm" step. The developer asked for a plain "Are you sure?".
- Visual design beyond the existing admin list and dialog styles.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_community_removed_notification`

- `NotificationType` gains **`COMMUNITY_REMOVED`**.
- `notifications` gains **`community_name VARCHAR(100) NULL`**: the community's name, copied when it is deleted. The notification cannot point at the community, which no longer exists, and `community_id` would cascade the notification away with it.
- Hand-written CHECK **`notifications_removed_shape`** in the same migration (invisible to Prisma, like the others):
  `(type = 'COMMUNITY_REMOVED') = (community_name IS NOT NULL)` and, for `COMMUNITY_REMOVED`, `community_id IS NULL AND post_id IS NULL`.
- `actor_id` is the deleting admin (it is `NOT NULL`). The reader never sees who the actor is for this type (§5). If the admin's account is removed later, these notifications cascade away with it. That is accepted.
- No other table changes. User deletion relies entirely on the existing `onDelete` rules (all `Cascade` or `SetNull`). `docs/tables.md` (+ `.docx`) is updated for the new column, value and CHECK.

## 4. API

All three endpoints are behind `requireAuth` + `requireAppAdmin` (per route, as in `routes/admin.ts`). Router → controller (Zod) → `adminDelete.service.ts` → Prisma.

### `GET /api/admin/users/:userId/deletion-preview`

What the dialog shows before the admin confirms.

- **Request:** `userId` as a UUID.
- **Success `200`:** `{ displayName, counts: { posts, ratings, comments }, communities: [{ id, name, outcome: 'TRANSFER' | 'DELETE', newOwner?: { id, displayName } }] }`. `communities` lists only those the user owns.
- **Errors:** `400` bad UUID · `401` · `403` not an app admin, or the target is an `ADMIN` ("Admins can't be deleted here.") · `404` user not found.

### `DELETE /api/admin/users/:userId`

- **Request:** `userId` as a UUID. No body.
- **Behaviour:** in **one transaction** (15 s timeout): lock the target's row and the rows of the communities it owns (`FOR UPDATE`, so nobody joins them meanwhile), re-read the target, refuse if it is an `ADMIN`; for each community it owns, pick the successor at that moment, delete the old owner's membership row, promote the successor to `OWNER` (in that order, because the partial unique index allows one owner), or delete the community if no one else is a member; then delete the user. After commit, send the `COMMUNITY_OWNER` notifications (actor = the admin) through the existing `writeSafely`, so a failed notification never undoes the delete.
- **Success `200`:** `{ transferred: [{ communityId, newOwnerId }], deletedCommunities: [communityId] }`. This is what actually happened, which may differ from the preview (§6).
- **Errors:** `400` bad UUID · `401` · `403` not an app admin / target is an `ADMIN` / target is the caller · `404` user not found (including already deleted) · `409` the target's ownership changed while deleting (nothing was deleted; retry).

### `DELETE /api/admin/communities/:communityId`

- **Request:** `communityId` as a UUID. No body.
- **Behaviour:** lock the community's row (`FOR UPDATE`: a new membership's foreign-key check waits on it, so the member list is complete), read the name and member ids, delete the community (cascades), and after commit create one `COMMUNITY_REMOVED` notification per former member (actor = the admin, `community_name` = the name) in a single `createMany` through `writeSafely`.
- **Success `204`.**
- **Errors:** `400` bad UUID · `401` · `403` not an app admin · `404` community not found (including already deleted).

The admin user list's `AdminUser` view already carries `isAdmin`, which tells the frontend which rows get no button, so no `role` field is added (amended in Stage 2: the spec first said `role`). The notifications list's filter (`notification.service.ts`) gains a branch for `COMMUNITY_REMOVED` with no membership condition, since the reader is no longer a member of anything. Its view carries `communityName`.

## 5. Screens & components

**Admin → Users** (`pages/Admin.tsx`)

- Each row gets a **Delete** button (danger style, ≥44×44px). It is not shown on rows whose role is `ADMIN`, including the admin's own row.
- Pressing it opens the dialog and loads the preview. While the preview loads, the dialog shows a spinner and the confirm button is not yet available.
- **Dialog**: title **"Are you sure?"**. Body: "Delete **Mia** and everything they posted? 12 posts, 30 ratings and 8 comments will be deleted, including replies others wrote under them. This can't be undone." Then one line per owned community: "**Jazz** passes to **Ada**." or "**Solo** will be deleted." The copy uses "they", never a gendered pronoun guessed from the name. Buttons: **Delete user** (danger) and **Cancel**. Escape, Cancel and a tap outside all close it without acting.
- While deleting: the confirm button shows a spinner, and both buttons are inert until the request ends.
- **Success:** the dialog closes, the row leaves the list, and a toast says "Mia was deleted."
- **Error:** the dialog stays open with the backend's message inline (a preview error has a Retry). The list is unchanged. A `404` (on the delete or on the preview) closes the dialog, removes the row and toasts "That user was already deleted."

**Admin → Communities** (same page)

- Each row gets a **Delete** button. No preview call is needed, because the row already shows the member count.
- **Dialog**: title **"Are you sure?"**. Body: "Delete **Jazz**? All 14 members lose its posts, ratings and comments, and each will be told an admin removed it. This can't be undone." Buttons: **Delete community** (danger) and **Cancel**. Loading, success, error and `404` behave as for users.

**Notifications** (`pages/Notifications.tsx`)

- `COMMUNITY_REMOVED` renders "**Jazz** was removed by an admin." with the generated community avatar for the stored name. There is no actor avatar or name, and it has no link: tapping it only marks it read.

**Empty states**: unchanged. If deleting the last user or community empties a list, the list's existing empty state shows.

## 6. Edge cases & failure modes

- **The preview is stale by the time the admin confirms** (the chosen successor left, or a member joined): the delete recomputes the successor inside the transaction, and the response reports what actually happened. The success toast is generic, so a mismatch is not shown as an error.
- **A double click or two admins at once:** the second request gets `404`, and the UI treats it as already deleted.
- **The target becomes an `ADMIN` between the preview and the delete:** the delete re-checks the role in the transaction and answers `403`.
- **The target owns several communities:** each is handled independently in the same transaction. If any step fails, the whole deletion rolls back.
- **The successor is banned from the community:** banned users are not members (`community_bans` is separate), so they can't be chosen.
- **The deleted user is signed in elsewhere:** their next request gets `401` and the client returns to Welcome. That is the existing interceptor; no new code.
- **The deleted user signs up again:** they get a new account with a new id. Nothing links it to the old one (D3).
- **The admin deletes a community they are a member of:** they receive the `COMMUNITY_REMOVED` notification too. That is harmless, and keeping it is simpler than excluding them.
- **The notification write fails after the delete committed:** the delete stands, and the failure is logged at `WARN` (`writeSafely`).
- **A non-admin calls the endpoints:** `403`. A non-admin visiting the admin page still sees the not-found page (§17).
- **The network drops mid-delete:** the dialog shows the error. Retrying is safe, because a repeat returns `404`, which the UI treats as done.

## 7. Test scenarios

**Unit (services)**

- ✅ `previewUserDeletion`: counts and one `TRANSFER` (to the oldest `ADMIN`) for an owned community.
- ✅ The successor falls back to the oldest `MEMBER` when the community has no `ADMIN`.
- ✅ The successor tie on `joined_at` is broken by `user_id`.
- ✅ A sole-member owned community → `DELETE`.
- ❌ Preview: target missing → `404`; target is `ADMIN` → `403`.
- ✅ `deleteUser`: removes the user, transfers ownership, deletes the sole-member community, returns what happened.
- ✅ `deleteUser`: sends `COMMUNITY_OWNER` to each new owner with the admin as actor.
- ❌ `deleteUser`: target missing → `404`; target is `ADMIN` → `403`; target is the caller → `403`.
- ❌ `deleteUser`: a failure mid-transaction leaves the user and every community unchanged.
- ❌ `deleteUser`: a notification failure does not undo the delete.
- ✅ `deleteCommunityAsAdmin`: removes the community and notifies every former member with its name.
- ❌ `deleteCommunityAsAdmin`: community missing → `404`.
- ❌ `deleteCommunityAsAdmin`: a notification failure does not undo the delete.

**Integration (endpoints)**

- ✅ `GET …/deletion-preview` `200` with transfers and deletions.
- ✅ `DELETE /api/admin/users/:id` `200`: the user is gone, their posts and comments are gone, another user's reply under their review is gone, the owned community has a new `OWNER`, the new owner has a `COMMUNITY_OWNER` notification, and the deleted user's cookie now gets `401` on `/api/auth/me`.
- ✅ After deletion, signing up again with the same Google `sub` creates a new account.
- ✅ `DELETE /api/admin/communities/:id` `204`: the community, its posts and its memberships are gone, and each former member's notification list shows `COMMUNITY_REMOVED` with the name.
- ❌ `400`: a malformed UUID on each of the three routes.
- ❌ `401`: no cookie on each of the three routes.
- ❌ `403`: a non-admin on each route; an admin targeting another `ADMIN`; an admin targeting themself.
- ❌ `404`: an unknown user (preview and delete); an unknown community; a second delete of the same target.
- ❌ The CHECK `notifications_removed_shape` rejects a `COMMUNITY_REMOVED` row without a name, and a row of another type with a name.

**Component**

- ✅ The users list shows Delete on a `USER` row and not on an `ADMIN` row.
- ✅ Delete opens "Are you sure?" with the preview's counts and the per-community lines.
- ✅ Cancel and Escape close it without a request.
- ✅ Confirm sends the delete, removes the row and shows the toast.
- ❌ A preview error shows inline with Retry. A delete error keeps the dialog open with the message.
- ❌ A `404` on delete removes the row with "already deleted".
- ✅ The communities list: Delete → dialog with the member count → confirm → row removed.
- ✅ Notifications renders `COMMUNITY_REMOVED` with the name and no actor.

**E2E** — none. Not a golden loop, and integration covers it.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                            | Reason                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2026-11-18 | D1 — deleting a user is a full hard delete through the existing cascades, others' replies in their threads included | Simplest; no schema change; consistent with data minimisation (§5)            |
| 2026-11-18 | D2 — owned communities pass to the oldest `ADMIN`, else the oldest `MEMBER`; sole-member ones are deleted           | Friends shouldn't lose a community because one person was removed             |
| 2026-11-18 | D3 — a deleted user may sign up again and starts empty; nothing about them is kept                                  | No identifier stored after deletion; communities are invite-only anyway       |
| 2026-11-18 | D4 — an `ADMIN` can't be deleted through the API, including oneself                                                 | Mirrors §17: the role lives in the database only; no accidental self-lock-out |
| 2026-11-18 | D5 — members of a community the admin deletes get a `COMMUNITY_REMOVED` notification with its name                  | So members understand why the community disappeared                           |
| 2026-11-18 | CLAUDE.md §17 "read-only lists" is amended to allow these two deletes                                               | Product owner's decision in this session                                      |
