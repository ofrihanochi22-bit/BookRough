# Feature: Direct recommendations

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Use cases** | UC-20 (new: send a recommendation to a friend); UC-11 retitled; UC-12, UC-13, UC-16, UC-18 amended |
| **Phase**     | 6 — new Step 6.1a of `DEVELOPMENT.md`, built before Step 6.2 (§0)                                  |
| **Branch**    | `feat/direct-recommendations`                                                                      |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                                 |

---

## 0. Where this sits in the roadmap

Phase 6's order becomes 6.3 → 6.1 → 6.3a → **6.1a** → 6.2 → 6.4 → 6.5 (developer's choice, 2026-11-02: build now, not after 6.2).

- Nothing here needs production: the feature is built and tested locally. Its merge still waits for the developer's word, green CI and the storage check (CLAUDE.md §16). Merging runs a migration on Neon when the next deployment starts, so it is expected after the pause ends on 2026-11-11.
- `feat/pwa-offline` (Step 6.2) stays parked until this PR merges, then is brought up to date with `main`. Its `NetworkFirst` rule for `GET /api/*` covers the new endpoints with no change, and sign-out wipes those copies. Until then this feature uses the existing offline banner pattern.
- Step 6.4's rate limiting must also cover `POST /api/recommendations`.

## 1. Goal

Two friends can send each other a song or album directly, with no community in common. Dana opens **Recommendations** (from the Friends screen) or Noam's profile, picks Noam, pastes a link, optionally adds a comment, and waits through the same conversion as a post. Noam sees a badge on the Friends tab, opens **Received**, and gets the song with one button for his own service. He can rate it there or save it to My List, and Dana sees the score. Community posting, feeds and permissions behave exactly as before.

## 2. Scope

**In scope**

- Schema: three `posts` changes, one `users` column, two hand-written CHECKs (§3).
- One shared access rule for every post, replacing four separate lookups (§3.3).
- Endpoints: send, list received, list sent, unseen count, mark seen, hide (§4).
- Rating, bookmarks, Post Detail, retry and delete working on direct items (§4.7).
- The Recommendations screen with Received and Sent, a send sheet, a **Send a song** button on a friend's profile, a row on the Friends screen, and the badge (§5).
- A notification stub, like ratings' and friend requests' (§4.8).
- Regression tests proving community behaviour is unchanged (§7).
- Doc updates (§9), including UC-20 and UC-11's title.

**Out of scope** — deliberately

- Sending to several friends at once (developer's choice, one friend per send). Each send creates one row, so multi-select can arrive later with no schema change.
- Replies, threads, or anything chat-like. One sender comment and one rating comment is the whole exchange (developer's choice).
- A per-friend thread, a sixth tab (developer's choices).
- Per-item read state (developer's choice): opening Received clears the count, and nothing marks individual songs.
- Undoing a hide. A hidden item stays reachable from My List or a direct link.
- Telling the sender about a hide, or either person about a delete.
- Blocking a user. Unfriending plus the rating block (§3.4) is the protection.
- Forwarding a community post to a friend.
- Editing the sender's comment, as for posts.
- A real notification channel; the stub is where one plugs in.
- Any admin change: no counts, no content (developer's choice).
- Showing direct ratings on a Public Profile. `find-people.md`'s rule stands: only ratings from communities you share.
- Account deletion: it is not a product feature (`profile-settings.md` §2). Only the database cascade exists (§3.1).
- A `PublicUser` change: `recommendations_seen_at` is never serialised.
- Visual design: every visual choice is a placeholder from existing tokens and primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --create-only --name add_direct_recommendations`, the SQL inspected and the two CHECKs appended, then applied; drift checked with `prisma migrate diff`; `community_members_one_owner`, `ratings_score_range`, `friends_one_per_pair` and `friends_not_self` confirmed present afterwards. Existing rows all have a community, so they satisfy both CHECKs. No new table: the count stays eleven.

### 3.1 `posts` and `users`

```prisma
model Post {
  // …existing fields, except:
  /// Null for a direct recommendation: exactly one of communityId and
  /// recipientId is set, enforced by the hand-written CHECK `posts_one_target`.
  communityId       String?   @map("community_id") @db.Uuid
  /// The friend a direct recommendation was sent to (UC-20).
  recipientId       String?   @map("recipient_id") @db.Uuid
  /// The recipient removed it from Received. Never serialised: the sender must
  /// not learn it. It affects Received only (§3.5).
  recipientHiddenAt DateTime? @map("recipient_hidden_at") @db.Timestamptz(3)
  author            User      @relation("PostAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  community         Community? @relation(fields: [communityId], references: [id], onDelete: Cascade)
  recipient         User?     @relation("PostRecipient", fields: [recipientId], references: [id], onDelete: Cascade)

  /// Received: newest first, keyset-paginated; also the recipient's cascade.
  @@index([recipientId, createdAt(sort: Desc), id(sort: Desc)])
  /// Sent: newest first, keyset-paginated.
  @@index([authorId, createdAt(sort: Desc), id(sort: Desc)])
}

model User {
  // …existing fields, plus:
  /// When Received was last opened; null until then. Never sent to a client.
  recommendationsSeenAt DateTime? @map("recommendations_seen_at") @db.Timestamptz(3)
}
```

Hand-written, appended to the migration (invisible to Prisma and to `prisma migrate diff`):

```sql
-- A post has exactly one target (direct-recommendations.md §3).
ALTER TABLE "posts" ADD CONSTRAINT "posts_one_target"
  CHECK (num_nonnulls("community_id", "recipient_id") = 1);
-- Nobody sends a recommendation to themselves.
ALTER TABLE "posts" ADD CONSTRAINT "posts_not_self" CHECK ("author_id" <> "recipient_id");
```

- `recipient` must be `Cascade`: `SetNull` would break `posts_one_target`.
- Deleting either person's user row, which only happens directly in the database, deletes the item for both, with its rating and bookmark.
- `ratings` and `bookmarks` are unchanged: they already reference `posts`.

### 3.2 Who may see a post

- **Community post:** current members of its community. Unchanged.
- **Direct recommendation:** its sender and its recipient, nobody else. Friendship is not needed to read: items stay visible to both after unfriending (developer's choice), so `unfriend.md` holds. The app admin has no access either.

### 3.3 One access rule

`requirePostAccess(user, postId)` in `services/postAccess.ts` replaces `requirePostMember` and the copies in `retryConversion`, `deletePost` and `saveBookmark`:

```ts
type PostAccess =
  | { scope: 'COMMUNITY'; authorId: string; communityId: string; role: CommunityRole }
  | { scope: 'DIRECT'; authorId: string; recipientId: string; isRecipient: boolean };
```

A missing post, a non-member, or a third party all get the same `404` "Post not found.", so an outsider cannot learn that an item exists. `communityId` being nullable makes TypeScript reject every remaining place that assumes a community, which is how the rest are found.

### 3.4 What friendship still gates

Sending needs an `ACCEPTED` friendship, and so do the two things that reach the other person afterwards: **a new rating and editing a rating** (developer's choice). Saving, removing from My List, opening, hiding, retrying a conversion and deleting stay allowed after unfriending, because they send nothing to the other person. If the two refriend, rating works again.

### 3.5 Hide and delete

- **The sender** deletes for both (UC-18's flow): the rating and bookmark go with it.
- **The recipient** hides for themselves. Hiding sets `recipient_hidden_at` and removes the item from Received and from the unseen count, nothing else (developer's choice): the bookmark and rating stay, the item still opens from My List or a direct link, and the sender keeps seeing the item and rating. There is no undo. The recipient cannot delete.

## 4. API

All responses use the CLAUDE.md §4 envelope. Every endpoint needs a signed-in, onboarded user (`requireOnboarded`, `403` "Finish your profile first."). `400` unparseable JSON; `422` validation failure.

### Shapes

```ts
PublicPost {
  // …every existing field, plus:
  direct: {                 // null for a community post; built field by field
    recipient: MemberUser;  // id, displayName, profilePictureUrl
    isFriend: boolean;      // the two are friends now; one query per page, no N+1
  } | null;
}
```

- `canDelete` on a direct item is true for the sender only.
- `recipient_hidden_at`, `recipient_id` and `recommendations_seen_at` never leave the server in raw form.
- `SavedPost.community` becomes `{ id, name } | null`. `isMember` stays community-only and is `false` when `community` is `null`; the UI branches on `post.direct` first. `ratingSummary` is sent for a direct item, whose two people may always see it.
- `GET /api/posts/:postId` returns `community: { id, name } | null`.

### `POST /api/recommendations`

Send one (UC-20). Reuses `parseSupportedLink`, `checkPostComment`, `convertLink` and `conversionData` from the post flow, so the blocking wait, the 12-second ceiling and the pending fallback (CLAUDE.md §7) are the same code. `createPost` and this function share one helper for the insert data.

- **Auth:** signed in and onboarded; a friend of the recipient.
- **Request:** `{ recipientId: string, url: string, comment?: string | null }`, `.strict()`. `recipientId` a UUID; `url` and `comment` as in `POST /communities/:id/posts`.
- **Order:** body shape → self → recipient exists → friendship → link → comment → conversion → insert.
- **Behaviour:** the conversion takes seconds, so the insert re-checks friendship in a transaction: `SELECT … FROM friends … FOR SHARE` on the accepted row, in either direction, not expressible in Prisma (CLAUDE.md §4). An unfriend running then waits for the insert. No row → `403`, nothing saved. The stub (§4.8) runs after commit.
- **Success:** `201 { post: PublicPost }` — also with `conversionPending: true` when the conversion could not run.
- **Errors:**
  - `400` unparseable JSON.
  - `401` signed out.
  - `403` "Finish your profile first."; `403` "You can only send songs to friends." — no friendship, a pending request in either direction, or unfriended mid-conversion. It never mentions a removal.
  - `404` "User not found." — unknown recipient, or one mid-onboarding.
  - `422` "You can't send a song to yourself."; the UC-11 invalid-link message (bad host or shape, or squigly's "could not be found"); "Comments can be up to 280 characters."; missing or malformed fields; an unknown key.

### `GET /api/recommendations/received?before=<cursor>`

- **Behaviour:** where the caller is the recipient and `recipient_hidden_at` is null, newest first, 20 per page, the feed's cursor. Items stay after unfriending.
- **Success:** `200 { posts: PublicPost[], nextCursor: string | null }`.
- **Errors:** `401`; `403` mid-onboarding; `422` "The request query is invalid."

### `GET /api/recommendations/sent?before=<cursor>`

- **Behaviour:** where the caller is the author and `recipient_id` is not null, newest first, 20 per page. A recipient's hide changes nothing here. Community posts never appear.
- **Success, errors:** as above.

### `GET /api/recommendations/unseen-count`

- **Behaviour:** Received items created after `recommendations_seen_at` (all of them while it is null), not hidden. One indexed count.
- **Success:** `200 { count: number }`.
- **Errors:** `401`; `403` mid-onboarding.

### `POST /api/recommendations/seen`

- **Behaviour:** sets `recommendations_seen_at` to now. Idempotent. Not a `GET`, so opening a cached screen offline never changes it.
- **Success:** `200 null`.
- **Errors:** `401`; `403` mid-onboarding.

### `PUT /api/recommendations/:postId/hidden`

- **Auth:** the recipient.
- **Behaviour:** sets `recipient_hidden_at` if it is null. Idempotent. Allowed after unfriending.
- **Success:** `200 null`.
- **Errors:** `401`; `403` mid-onboarding; `403` "Only the recipient can hide this." (the sender); `404` "Post not found." (unknown or malformed id, a third party, or a community post, which never has a recipient).

### 4.7 Changes to existing endpoints

Community behaviour, status codes and messages stay exactly as they are. Direct items, reached through `requirePostAccess`:

| Endpoint                         | Direct item                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /posts/:postId`             | Both parties; third party `404`; `community: null`                                                                                             |
| `GET /posts/:postId/ratings`     | Both parties; third party `404`                                                                                                                |
| `POST /posts/:postId/ratings`    | Recipient only; sender `403` "You can't rate your own post."; third party `404`; not friends now `403` "You can only rate songs from friends." |
| `PATCH /posts/:postId/rating`    | Recipient only, as above; no rating `404`; not friends now `403`                                                                               |
| `PUT /posts/:postId/bookmark`    | Recipient only, also after unfriending; sender `403` "You can't save your own post."; rated `409`; third party `404`                           |
| `DELETE /posts/:postId/bookmark` | Unchanged: it only ever deletes the caller's own row                                                                                           |
| `POST /posts/:postId/conversion` | Sender only, also after unfriending; recipient `403` "Only the author can do this."; third party `404`; not pending `409`                      |
| `DELETE /posts/:postId`          | Sender only, also after unfriending; recipient `403` "Only the sender can delete this."; third party `404`                                     |
| `GET /users/me/bookmarks`        | Lists saved direct items with `community: null`, hidden or not                                                                                 |
| `GET /users/:userId/ratings`     | Never includes direct items: its filter goes through community membership                                                                      |

### 4.8 Notification stub

`services/recommendationNotification.ts`: `notifyRecommendation({ senderId, recipientId, postId })` logs `info` with the ids only, "Recommendation notification (stub)", after commit. A failure inside is caught and logged at `warn`; it never fails the send. `notifyAuthorOfRating` already covers ratings.

### Logging

`info` `{ userId, recipientId, postId, conversionPending }` "Recommendation sent"; `{ userId, postId }` "Recommendation hidden". No URLs, titles or comments.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders. This adds a sixteenth screen.

### 5.1 Friends screen and the badge

- A **Recommendations** row at the top of `pages/Friends.tsx`, above community invitations, always shown, with the unseen count when above zero. It links to `/recommendations`.
- The Friends tab badge adds the unseen count to requests and invitations (`stores/friendRequests.ts`), refreshed on navigation like today. A failed fetch keeps the last count. The accessible name is unchanged ("Friends, n waiting").

### 5.2 Recommendations (`pages/Recommendations.tsx`, route `/recommendations`, inside the tab layout)

- Heading "Recommendations", a back link to Friends, a **Send a song** button, and a **Received** / **Sent** switch. Received is the default.
- Opening Received calls `POST /recommendations/seen` after its first page loads, and the badge refreshes. A failed call is silent.
- Cards reuse `PostCard`, extended for direct items: "From {sender}" on Received, "To {recipient}" on Sent, the existing Open and Other services buttons, the comment, the bookmark icon, "You rated n/10", and the title linking to Post Detail. The community-only parts stay out.
- **Received card:**
  - **Rate & Review** opens `RatingSheet` (UC-13's rules and messages), and after `201` the card shows "You rated n/10". It works whether or not the song was saved.
  - Not friends now (`direct.isFriend` false): "You're no longer friends with {name}" replaces the rate button. Saving and opening stay.
  - A ⋯ menu with **Hide** and a confirmation: "Hide this from Received? {name} won't be told." The card leaves the list, with the toast "Hidden from Received".
- **Sent card:** shows the rating ("★ 8 · 1 rating") when there is one, **Find on other services** when pending, and the existing ⋯ delete menu. The confirmation says "Delete this recommendation? {name} will lose it too, with any rating. They won't be notified."
- **Load more** at the bottom of each list while `nextCursor` exists; failure → inline Try again.
- **Loading:** three card skeletons per list.
- **Empty:** Received, "Nothing here yet" / "Songs your friends send you appear here."; Sent, "You haven't sent anything" / "Send a friend a song from the button above."
- **Load error:** `LoadError` "Couldn't load your recommendations." with Try again; the switch and Send stay usable.
- **Offline:** the banner "You're offline. Connect to send or change anything."; Send, Rate, Hide, Delete and the bookmark disabled; loaded lists stay readable; nothing queued (CLAUDE.md §16).

### 5.3 Send sheet (`components/SendRecommendationSheet.tsx`)

One component, opened from both places. `PostComposer`'s link-and-comment form is extracted into a shared `LinkCommentForm`, so the validation, busy copy and draft rules exist once.

- **From Recommendations:** a friend picker from `GET /api/friends` first. Loading → skeleton rows. Load failure → inline Try again. No friends → "Add a friend first" with a link to Search, no form.
- **From a profile:** the friend is preselected and named, with no picker.
- **Sending:** the sheet can't be dismissed, the fields are read-only, and the button reads "Finding this track on other services…".
- `201` converted or pending → the sheet closes, the toast "Sent to {name}", and Sent reloads if it is showing. A pending item shows the usual quiet note. No error dialog.
- `422` → inline under the field; the draft stays.
- `403` "You can only send songs to friends." → inline; the draft stays; from the screen the picker reloads, and from a profile the sheet stays open until closed and the profile reloads on closing.
- `404` → inline "This person is no longer available."; the draft stays.
- Network failure or `5xx` → inline "Couldn't send. Check your connection and try again."; the draft stays.
- Requests wait 30 s, like posting (`CONVERSION_REQUEST_TIMEOUT_MS`).

### 5.4 Public Profile

With `friendship: 'FRIENDS'`, a **Send a song** button beside the Friends control, opening the sheet. Other states show nothing. Offline → disabled.

### 5.5 My List and Post Detail

- **`SavedPostCard`:** for a direct item, "Sent by {sender}" replaces "Shared by {author} in {community}", no community link. Rate & Review shows while friends; otherwise "You're no longer friends with {name}".
- **Post Detail:** "← Recommendations" replaces the community back link. The sender sees the rating; the recipient sees Edit while friends and no Edit otherwise. The recipient has no delete option; the sender deletes and returns to Recommendations. `404` → the standard not-found page.

## 6. Edge cases & failure modes

- **squigly.link down or slow** → the item is saved as pending within 12 s; the sender can retry; the recipient sees the original link and "Other services unavailable".
- **Unfriended mid-conversion** → the transaction's check fails → `403`, nothing saved, the draft stays.
- **An unfriend racing the insert** → `FOR SHARE` makes it wait; the item is saved and stays, like any earlier item.
- **Stale picker or profile** → `403` with the neutral message.
- **Refriending** → past items are all still there, and rating works again.
- **Pending friend request in either direction** → not a friendship → `403`.
- **Recipient mid-onboarding or unknown** → `404`.
- **Rating after unfriending, from a stale tab** → `403`; the sheet closes and the list reloads, showing the "no longer friends" line.
- **Sender deletes while the recipient has it open or saved** → the bookmark and rating cascade; the next action gets `404`, using UC-13's ghost-row handling on My List.
- **Hide twice, or from two tabs** → idempotent.
- **Hidden, then saved or rated through a direct link** → allowed; it stays out of Received.
- **Same song sent twice** → allowed, two items, as in communities.
- **Badge race:** an item arriving between loading Received and marking seen is shown on the next load, but not counted. Accepted, as the badge is a hint.
- **A malformed `postId`** → `404`; **a malformed `before`** → `422`.
- **A community post passed to the hide endpoint** → `404`.
- **A forgotten community assumption** → a compile error from the nullable type. A direct item in a community query is impossible: each of those queries filters by `communityId`.
- **A viewer who rated gets no bookmark icon**, as in the feed.

## 7. Test scenarios

**Unit — `recommendation.service`**

- ✅ `sendRecommendation`: friends, converted → row with recipient, no community, metadata and links; the stub is called after commit.
- ✅ The conversion `unavailable` (timeout) → saved with `conversionPending`.
- ❌ To yourself → `422`; unknown or mid-onboarding recipient → `404`; caller mid-onboarding → `403`.
- ❌ Not friends, a pending request in each direction → `403`, converter never called.
- ❌ Unfriended during the conversion → `403`, no row.
- ❌ Bad link → `422`, converter never called; `not_found` → `422`, no row; comment over 280 → `422`.
- ✅ A failing stub is logged and does not fail the send.
- ✅ `listReceived` / `listSent`: newest first, 20 per page, no gaps or duplicates on equal timestamps; `isFriend` per item with one friendship query; hidden items out of Received and still in Sent; community posts in neither; other users' items in neither.
- ❌ Malformed cursor → `422`.
- ✅ `countUnseen`: all when never opened; only newer items afterwards; hidden excluded. `markSeen` sets the time and is idempotent.
- ✅ `hideRecommendation`: sets the column, idempotent, works after unfriending.
- ❌ Hide: sender → `403`; third party, unknown post, community post → `404`.

**Unit — shared rule and serialisers**

- ✅ `requirePostAccess`: member, sender and recipient each get their scope.
- ❌ Non-member, third party, unknown post → `404`.
- ✅ `toPublicPost`: exact key set; `direct` null for a community post; `recipient` has three keys; `canDelete` false for the recipient.
- 🔒 No raw `recipientHiddenAt`, `recipientId` or `recommendationsSeenAt` in any serialised shape.
- ✅ `toSavedPost`: `community: null` for a direct item.
- ✅ `ratePost` / `editRating`: recipient while friends.
- ❌ `ratePost` / `editRating`: sender `403`; after unfriending `403`; third party `404`.
- ✅ `saveBookmark`, `retryConversion`, `deletePost`, each allowed after unfriending for the right party.
- ❌ Each refused for the wrong party, with the §4.7 status.

**Integration (Supertest, scraper mocked)**

- ✅ `POST /recommendations` → `201`; the recipient's Received lists it, the sender's Sent lists it, and each gets the viewer's own `isMine`.
- ✅ A scraper timeout → `201` with `conversionPending: true`; the retry converts it.
- ❌ `400` unparseable JSON; `422` missing `recipientId`, malformed `recipientId`, missing URL, a playlist link, comment 281, an unknown key, yourself.
- ❌ `401` signed out on all six endpoints; `403` mid-onboarding on all six.
- ❌ `403` a stranger, each direction of a pending request, after unfriending; `404` an unknown recipient.
- ❌ A third party gets `404` on `GET /posts/:id`, `GET /posts/:id/ratings`, ratings, bookmark, conversion, delete and hide.
- ✅ Received and Sent page with `nextCursor`; ❌ `422` bad cursor.
- ✅ The count: two sends → 2; `POST seen` → 0; another send → 1; hide → 0.
- ✅ Rating from Received with no bookmark → `201`; the sender sees the score in Sent and on Post Detail.
- ✅ Hide with a bookmark and a rating: out of Received, still in My List and Post Detail; the sender's view is unchanged and carries no sign of it.
- ✅ Sender deletes: gone for both, with the rating and bookmark; the recipient gets `404`.
- ✅ After unfriending: both lists unchanged, `isFriend` false, save `200`, hide `200`, rate `403`, edit `403`, send `403`. After refriending: rate `201`.
- ✅ Deleting a user row directly removes the item, rating and bookmark for the other person (cascade).
- ✅ The database refuses a post with both targets, with neither, and with `author = recipient`.
- 🔒 A direct rating is absent from `GET /users/:userId/ratings`, even for a viewer sharing a community with the rater.
- 🔒 Admin responses contain no recipient, recommendation or content.

**Regression — community behaviour unchanged**

- ✅ Create, feed, retry, delete, bookmark, rating and Post Detail keep their status codes and exact payload key sets, plus `direct: null`.
- ✅ A direct item never appears in a community feed, even when both people share that community.
- ✅ `removeMember` deletes the target's posts and ratings in that community and leaves their direct items, including ratings on them.
- ✅ Leaving and community deletion leave direct items untouched.
- ✅ My List with community and direct items mixed: pages cleanly, and a left community still shows `isMember: false`.
- ✅ Unfriending leaves shared communities, their posts, ratings and bookmarks untouched.

**Component (Vitest + RTL)**

- ✅ Friends: the Recommendations row with and without a count. Tab bar: the badge sums all three.
- ✅ Recommendations: skeletons; Received by default, with `seen` called; switching to Sent; Load more; both empty states.
- ✅ Received card: From line, Rate → sheet → "You rated n/10"; Hide → confirm → the card leaves.
- ✅ Not friends: the "no longer friends" line, no rate button.
- ✅ Sent card: To line, rating shown, retry when pending, delete → confirm → the card leaves.
- ❌ Load error with Try again; Load more failure; rating `403` reloads; offline banner disables every write.
- ✅ Send sheet: picker, then the form; preselected from a profile; busy copy and read-only fields; success toast.
- ❌ Send sheet: no friends; picker load failure; invalid link without a request; comment over 280; `403`, `404`, `422` and a network failure, each keeping the draft; offline.
- ✅ Profile: Send a song only for `FRIENDS`.
- ✅ SavedPostCard: "Sent by"; no community link; the "no longer friends" line.
- ✅ PostDetail: "← Recommendations"; no delete for the recipient; Edit only while friends; delete returns to Recommendations.
- ✅ `PostComposer` still passes its existing tests after the form extraction.

**E2E (Playwright, scraper stand-in)** — one golden loop

- ✅ A and B become friends with different services and no community. A sends the known track with a comment; B sees the badge, opens Received and sees "Open in {B's service}"; B rates it 8; A sees the score under Sent. (Chromium and iPhone WebKit.)

## 8. Open questions

- None at approval.
- Accepted risk: a recipient cannot remove a comment from Post Detail by hiding, by the developer's choice in §3.5. Unfriending stops new sends, and the sender can delete.
- Accepted risk: until Step 6.4 there is no rate limit on sending. `p-limit(2)`, the 12 s ceiling and the friendship requirement bound the cost.

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: new UC-20; UC-11's title drops "Friend/Group Chat" and points to UC-20; UC-12, 13, 16, 18 preconditions cover direct items; UC-8 notes that items stay and rating stops.
- `docs/tables.md` + `.docx`: `posts` (nullable community, recipient, hidden, indexes, both CHECKs, cascades), `users.recommendations_seen_at`.
- `docs/frontend screens.md` + `.docx`: the new screen and send sheet; 2.3 Friends row; 2.4 Send a song; 3.4 Post Detail; 4.1 My List; the count becomes sixteen.
- `docs/general.md`, `docs/system architecture conventions.md`, `docs/tests.md` + `.docx`: where they describe posts as community-only, or the shared access rule.
- `posts-feed.md`, `posts-delete.md`, `rate-post.md`, `bookmarks-my-list.md`, `post-detail.md`, `friend-requests.md`, `unfriend.md`, `find-people.md`: amendment notes pointing here.
- CLAUDE.md: §6 (the two CHECKs and nullable `community_id`), §8 (sixteen screens), §9 (UC-20), §12 if the phase list needs it.
- `DEVELOPMENT.md`: Step 6.1a per §13; the Phase 6 order; Step 6.2's stale "Not started" status corrected.
- `HANDOFF.md`: the new order, Step 6.1a, and the Images Storage reading of 15.25 GB (2026-11-02).

## 10. Decisions log

| Date       | Decision                                                                                                      | Reason                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2026-11-02 | Extend `Post` with a nullable community and a recipient (option A)                                            | Reuses conversion, ratings, bookmarks and Post Detail; the compiler finds community assumptions  |
| 2026-11-02 | A separate table (B) and a hidden community per pair (C) rejected                                             | B duplicates ratings, bookmarks and paging; C leaks through unfiltered community queries         |
| 2026-11-02 | One friend per send (option A)                                                                                | Personal, no partial failure; multi-select can arrive with no schema change                      |
| 2026-11-02 | A new Recommendations screen, entered from Friends (option A)                                                 | Keeps five tabs; a flat list does not invite chat                                                |
| 2026-11-02 | Sending starts from that screen or a friend's profile, with one sheet (option A)                              | Covers both situations with one component                                                        |
| 2026-11-02 | Two lists, Received and Sent, Received by default (option A)                                                  | What waits for you is not buried; the sender can return to what they sent                        |
| 2026-11-02 | Items stay visible to both after unfriending (option A)                                                       | No song lost; `unfriend.md` holds                                                                |
| 2026-11-02 | A refused send uses a neutral message                                                                         | Unfriending is already visible on the profile; "silent" means no notification                    |
| 2026-11-02 | The recipient rates directly from Received, and from My List if saved (option A)                              | One action after listening; amends `rate-post.md`'s My List-only rule for direct items           |
| 2026-11-02 | After unfriending, a new rating and an edit are blocked; private actions stay (option A)                      | Closes a channel to someone who removed you, with no blocking feature                            |
| 2026-11-02 | The sender deletes for both; the recipient hides for themselves (option B)                                    | Each side controls their own list and the sender loses nothing                                   |
| 2026-11-02 | Hiding affects Received only; bookmark and rating stay (option B)                                             | Developer's choice: nothing is lost, and the least code                                          |
| 2026-11-02 | A badge count, cleared by opening Received, with one `users` column (option A)                                | Matches the existing badge; no per-item writes                                                   |
| 2026-11-02 | One sender comment and one rating comment, 280 each, no replies (option A)                                    | Reuses the text rules; this stays a recommendation, not a chat                                   |
| 2026-11-02 | No admin change (option A)                                                                                    | Consistent with no post counts; adds no data on private behaviour                                |
| 2026-11-02 | Build now as Step 6.1a, before Step 6.2 (option B)                                                            | Developer's choice: 6.2's iPhone checks wait for the pause anyway                                |
| 2026-11-02 | Stage 2: `prepareSharedLink` holds validation and conversion for both flows; `LinkCommentForm` holds the form | Reuse, as the spec asked; `createPost`'s checks and order are unchanged                          |
| 2026-11-02 | Stage 2: friendship is checked before the conversion and again with the insert                                | The first spares a browser; the second is the one that holds under a race                        |
| 2026-11-02 | Stage 2: the badge keeps `unseen` apart from `count`, and the tab shows the sum                               | The Friends screen sets `count` after each answer, which would overwrite a combined number       |
| 2026-11-02 | Stage 2: a rating refused with `403` calls `onStale` on `RatingSheet`                                         | §6 asks for a reload; other callers keep closing as before                                       |
| 2026-11-02 | Stage 3: Sent reloads after a send instead of prepending the card                                             | `/code-review`: a kept card could reappear after being deleted, once the list reloaded           |
| 2026-11-02 | Stage 3: the form stays mounted, hidden, while choosing another friend                                        | `/code-review`: Change discarded the draft, against §5.3                                         |
| 2026-11-02 | Stage 3: `beforeCursor` shared by the post, profile and recommendation lists                                  | `/code-review`: the keyset filter had reached a fourth copy; My List keeps its own, on `post_id` |
