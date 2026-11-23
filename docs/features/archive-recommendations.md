# Feature: Archive received recommendations

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| **Use cases** | UC-20 amended (the Received list of the Recommendations screen)                 |
| **Phase**     | 6 — parked idea D2 from the 2026-11-22 manual test                              |
| **Branch**    | `feat/archive-recommendations`                                                  |
| **Status**    | ☑ Spec approved (2026-11-22) · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged |

---

## 1. Goal

Today every direct recommendation a user receives stays in **Received** forever, rated or not. The only way out is **Hide**, which can't be undone and leaves the item reachable only from My List or a direct link. After this ships, Hide becomes **Archive**: the user moves an item out of Received by hand, sees a toast with **Undo**, and can open the archive from an **Archived · N** row at the top of Received, where each card has **Unarchive**. Everything hidden before this feature is in the archive.

## 2. Scope

**In scope**

- **Which list** (Stage 1 answer 1). Received only.
- **When** (answer 2). Manual only: an **Archive** button on each Received card. Rating doesn't archive, and neither does saving, opening or checking. Any received item can be archived, rated or not.
- **Hide** (answer 3). Archive replaces Hide. The Hide button, its confirmation sheet and `PUT /api/recommendations/:postId/hidden` are removed. Items hidden until now become archived, through a column rename, so nothing disappears.
- **Where the archive is** (answer 4). An **Archived · N** row at the top of Received opens the archive on the same screen. Each archived card has **Unarchive**, which puts it back in Received.
- Archiving shows a toast, "Archived", with **Undo**, the pattern from D1's Mark checked (community-unchecked.md §5).
- What stays from Hide (direct-recommendations.md §3.5): it's for the recipient only; the sender isn't told and keeps seeing the item and its rating in Sent; the bookmark and rating stay; it's allowed after unfriending; it removes the item from the unseen count.

**Out of scope**

- Archiving in Sent, My List, D1's Communities list or a community feed (answer 1). My List and the Communities list already drop rated items by themselves.
- Archiving automatically on a rating, or after some time (answer 2).
- "Archive all" or "Archive all rated". Not asked for; it can be added later.
- Telling the sender, or showing them that an item was archived.
- A fourth pill or a separate screen for the archive (answer 4).
- Searching or filtering the archive.
- Offline queueing: Archive and Unarchive need a connection, like the other writes.
- Visual design: the Archived row and the buttons are placeholders from existing primitives.

## 3. Data model changes

None in the database. The Prisma field is renamed, and the column keeps its name:

```prisma
/// The recipient archived it: out of Received, into their archive. Never
/// serialised: the sender must not learn it. The column keeps its old name so a
/// running older deployment never breaks (archive-recommendations.md §3).
recipientArchivedAt DateTime? @map("recipient_hidden_at") @db.Timestamptz(3)
```

- Every item hidden before this feature has its timestamp in that column, so it's archived (answer 3).
- No migration, on purpose. A `RENAME COLUMN` would break the previous production deployment, still serving during the switch and kept as the rollback target: Prisma names every column of `posts` in its selects, so each post query there would fail. `prisma migrate diff` reports no difference.
- No new index. Received and the archive both read by `recipient_id`, newest first, through the existing `(recipient_id, created_at desc, id desc)` index; the archive time is a filter on rows the index already narrows to one user.
- The column stays out of every client payload: `toPublicPost`'s field-by-field rule is unchanged, and its comment is renamed.
- `docs/tables.md` (+ `.docx`): `recipient_hidden_at` keeps its name, with the new meaning. No new table: still seventeen.

## 4. API

All under `recommendationsRouter`, with auth and an onboarded user, like the rest of the router. A malformed post id gets `404` (the shared `parsePostId`), and a bad query or cursor `422` (the shared `parseQuery` and `decodeCursor`), as on every list and post route.

### `GET /api/recommendations/archived?before=<cursor>`

- **Request:** query `{ before?: string (max 200) }`, `.strict()`, the cursor format of Received.
- **Behaviour:** where the caller is the recipient and the archive time (`recipient_hidden_at`) is not null. Newest first by when the item was **sent**, `PAGE_SIZE` per page, the same keyset as Received. The same `toPublicPost` with rating summaries and friends as Received.
- **Success:** `200 { posts: PublicPost[], nextCursor: string | null }`, the shape of Received.
- **Errors:** `422` an unknown query key or a malformed cursor; `401` unauthenticated; `403` not onboarded.

### `GET /api/recommendations/archived/count`

- **Success:** `200 { count: number }`: the caller's archived items. One indexed count.
- **Errors:** `401`; `403` not onboarded.

### `PUT /api/recommendations/:postId/archived`

Replaces `PUT /:postId/hidden`, with the same rules.

- **Request:** `postId` as a UUID. No body.
- **Behaviour:** `requirePostAccess`, then the recipient check. Sets the archive time to now where it's null, so it's idempotent and a second archive keeps the first time. Logs "Recommendation archived" with `userId` and `postId`.
- **Success:** `200 { data: null }`, also when it was already archived.
- **Errors:**
  - `404` a malformed post id;
  - `401`;
  - `403` not onboarded;
  - `403` "Only the recipient can archive this.": the caller is the sender (they can see the post, so a `404` would be wrong);
  - `404` "Post not found.": the post is missing, it's a community post, or the caller is a third party (the shared access rule, so an outsider can't learn it exists).

### `DELETE /api/recommendations/:postId/archived`

- **Behaviour:** Unarchive and Undo. Sets the archive time to null. Idempotent: an item that isn't archived answers `200`. Allowed after unfriending, like archiving. Logs "Recommendation unarchived".
- **Success / errors:** as for PUT, with "Only the recipient can unarchive this." for the sender.

### Removed: `PUT /api/recommendations/:postId/hidden`

An installed app still running the old shell gets `404` from it until it reloads. The old Hide sheet already treats `404` as "gone" and drops the card, and the version-update prompt (CLAUDE.md §16) brings the new shell. Accepted.

### Unchanged

- `GET /received` and `GET /unseen-count` filter on `recipientArchivedAt: null`, the same column as before.
- `GET /sent` ignores the column, as it ignored the hide.

## 5. Screens & components

### Recommendations (2.5), Received

- **Archived row:** at the top of the Received list, a full-width secondary row, "Archived · 12", at least 44 px tall. It's shown only when the count is above 0 and has loaded; a failed count just leaves the row out. Pressing it switches the Received tab to the archive view.
- **Archive button:** replaces Hide on each Received card, in the same place. Pressing it removes the card at once and shows a toast, "Archived", with **Undo**. No confirmation sheet, since it can be undone. Undo calls DELETE, then reloads Received and the count. If the PUT fails, the card comes back and the toast says "Couldn't archive this. Check your connection and try again." A `404` means the item is gone: the card stays removed, with no error.
- The count goes up by one after an Archive and is re-fetched after Undo.
- `HideRecommendationSheet` and the Hide copy in `recommendationCopy.ts` are deleted.

### Recommendations (2.5), the archive view

- **Header:** a back control, "← Received", and the title "Archived". The pill switch stays on Received. Leaving the screen, or switching pills, and coming back opens Received, not the archive.
- **The list:** the same `PostCard` as Received, with the same actions (Open in, Other services, bookmark, Comments, Rate & Review), and **Unarchive** in place of Archive. Pressing it removes the card from the archive at once and shows "Back in Received". There's no Undo: archiving it again is the undo. A failure brings the card back with "Couldn't unarchive this. Check your connection and try again."; a `404` drops it with no error.
- **Loading:** three skeletons and `LoadingHint`, as on Received.
- **Empty** (reached when the last item is unarchived): "Nothing archived" / "Recommendations you archive from Received appear here."
- **Error:** `LoadError` with "Couldn't load your archive." and Try again. Load more failing works as on Received.
- **Offline:** Archive and Unarchive are disabled (the `offline` button state), as Hide was.

### Elsewhere

- Post Detail, My List and Sent don't change. An archived item still opens from My List or a direct link, as a hidden one did.

### `docs/frontend screens.md` (+ `.docx`)

Screen 2.5 gains the Archived row, the archive view and the Archive button, and loses Hide.

### Other docs

- `docs/use cases.md` (+ `.docx`): UC-20 amended, "the recipient may archive an item and unarchive it" in place of hiding.
- `direct-recommendations.md`: an "Amended by" note at the top, and §3.5 pointing here.

## 6. Edge cases & failure modes

- **The sender deletes an archived item.** It's gone from the archive, with its bookmark and rating, as before. Unarchive racing the delete gets `404`, and the card is dropped.
- **Unfriended.** Archived items stay archived and can be unarchived. Rating from the archive needs friendship, as on Received.
- **Two devices.** Archiving on one shows on the other at its next load. Both writes are idempotent, so there's no conflict.
- **Undo after leaving the list.** The toast lasts its usual time; Undo still restores the item on the server, and Received shows it at the next load (the accepted D1 corner case).
- **The unseen count.** An archived item doesn't count. Unarchiving can't put one back in the badge in practice: archiving happens from Received, which marks everything seen.
- **Rating, saving or opening in the archive** works as in Received and leaves the item archived.
- **Old shell.** See §4 on the removed `/hidden` route.
- **Malformed input.** A bad cursor or query key gets `422`; a malformed post id `404`.

## 7. Test scenarios

**Unit (`recommendation.service.test.ts`)**

- ✅ `archiveRecommendation` sets the time, and a second call keeps the first time.
- ✅ `unarchiveRecommendation` clears it, and is a no-op on an item that isn't archived.
- ✅ Both are allowed after unfriending.
- ❌ Archive or Unarchive by the sender → `403` with the recipient-only message.
- ❌ On a community post, a missing post or a third party's item → `404`.
- ❌ A not-onboarded user → `403` on list, count, archive and unarchive.
- ✅ `listArchived` holds only the caller's archived items, newest first, and paginates with a cursor and no repeat.
- ❌ `listArchived` with a malformed cursor → `422`.
- ✅ `countArchived` matches the list.
- ✅ `listReceived` and `countUnseen` exclude archived items; `listSent` includes them.
- ✅ The bookmark and rating survive archive and unarchive.

**Integration (`recommendations.integration.test.ts`)**

- ✅ `200` for the archive list, its count, PUT and DELETE, with the item leaving Received and coming back.
- ✅ A row hidden before this feature (written straight to `recipient_hidden_at`) is in the archive.
- ❌ `422`: an unknown query key or a bad cursor on the archive list.
- ❌ `401` on all four without a session.
- ❌ `403` on all four for a not-onboarded user; `403` on PUT and DELETE by the sender.
- ❌ `404`: PUT and DELETE on a malformed id, a missing post, a community post and a third party's item.
- ❌ `404` from the removed `PUT /:postId/hidden`.
- ✅ The sender's Sent still shows an archived item.

**Component (`Recommendations.test.tsx` and a new `Recommendations.archive.test.tsx`)**

- ✅ Received shows "Archived · N" when the count is above 0, and no row at 0 or when the count fails.
- ✅ Archive removes the card, shows the toast, and Undo restores it.
- ❌ A failed Archive brings the card back with the error toast; a `404` keeps it removed.
- ✅ The row opens the archive; "← Received" goes back.
- ✅ The archive lists cards with Unarchive, and Unarchive removes the card with "Back in Received".
- ❌ A failed Unarchive brings the card back with the error toast.
- ✅ The archive's empty state; ❌ its error state with Try again.
- ✅ Archive and Unarchive are disabled offline.
- ✅ No Hide button anywhere.

**E2E**: none. This isn't a golden loop, and the integration tests prove the rule.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                           | Reason                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | Received only (answer 1)                                                                           | It's the one list where handled items pile up; My List and Communities already drop rated items                         |
| 2026-11-22 | Manual only, no automatic archive on rating (answer 2)                                             | Developer's choice                                                                                                      |
| 2026-11-22 | Archive replaces Hide, and hidden items become archived (answer 3)                                 | One button with an undo, in place of two similar ones on a phone card                                                   |
| 2026-11-22 | An "Archived · N" row inside Received, not a fourth pill (answer 4)                                | Three pills already fill a 375 px row (community-unchecked.md §9)                                                       |
| 2026-11-22 | Keep the column `recipient_hidden_at` and rename only the Prisma field (`@map`), with no migration | `/code-review`: a `RENAME COLUMN` breaks the previous deployment, still serving during the switch and kept for rollback |
| 2026-11-22 | No confirmation sheet on Archive; a toast with Undo instead                                        | It can be undone, as D1's Mark checked                                                                                  |
| 2026-11-22 | The archive is ordered by when the item was sent, not when it was archived                         | Reuses Received's keyset and index; no new index or cursor format                                                       |
