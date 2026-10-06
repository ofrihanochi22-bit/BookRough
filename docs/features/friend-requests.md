# Feature: Friend requests

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                  |
| ------------- | -------------------------------------------------------------------------------- |
| **Use cases** | UC-6 (send a friend request), UC-7 (accept / ignore); UC-6 and UC-7 amended (§9) |
| **Phase**     | 5 — Step 5.2 of `DEVELOPMENT.md` (see `find-people.md` §0)                       |
| **Branch**    | `feat/friend-requests`                                                           |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged               |

---

## 0. Phase 5 grows a fourth feature

Phase 5 was re-sliced into three features (`find-people.md` §0). This session adds a fourth (decided 2026-10-06, option B): UC-9's friends picker — inviting friends to a community — becomes its own feature after Unfriend, with its own spec session. Until then friendship is social only (a list, and a status on profiles), and Create Community's static "Invite friends" card stays.

| #   | Feature                              | Spec            |
| --- | ------------------------------------ | --------------- |
| 1   | Find people (UC-5)                   | merged (#29)    |
| 2   | **Friend requests (UC-6, UC-7)**     | this document   |
| 3   | Unfriend (UC-8)                      | its own session |
| 4   | Invite friends to a community (UC-9) | its own session |

## 1. Goal

From anyone's Public Profile, a signed-in user taps **Add Friend**; the button becomes **Request sent** (which can be cancelled). The other person sees a badge on a new **Friends** tab, opens it, and under **Requests** taps **Accept** or **Ignore**. Accepted, both see each other under **Your friends** and **Friends** on each other's profile. Friendships are private: nobody sees anyone else's friends, and being friends changes nothing else about what a profile shows.

## 2. Scope

**In scope**

- Schema: the `friends` table (§3), with a hand-written guard against a reverse-direction duplicate.
- Endpoints: send, cancel, accept, ignore, list friends, list incoming requests, count them; the viewer's `friendship` status on `GET /api/users/:userId` (§4).
- Anyone signed in and onboarded can send a request to anyone onboarded (developer's choice, Q2 option A).
- Ignore deletes the request; the sender sees **Add Friend** again and may re-send (Q3 option A, UC-7 as written).
- A sender cancels their own request from the profile (Q5 option B).
- A request to someone who has already requested you makes you friends at once (§6).
- The **Friends** tab — a fifth tab with a pending-request badge — and the Friends screen: Requests, then Your friends (Q4 option A) (§5).
- The friend button on the Public Profile, in its four states (§5.3).
- A notification stub, like ratings': a log line on a new request and on an acceptance (§4.4).
- Doc updates (§9).

**Out of scope** — deliberately

- Removing a friend — feature 3 (UC-8). A friendship, once accepted, has no action in this feature.
- Inviting friends to a community (UC-9's picker) — feature 4.
- Privacy settings for who may send requests, and blocking (Q2: option A). UC-6's fail path is amended (§9).
- A cooldown or a silent ignore (Q3: option A). Re-sending after an ignore is allowed.
- A "Sent" list of outgoing requests (Q5: option B). Cancelling happens on the profile.
- Anyone else's friends: no friend list, count, or "friends in common" on a profile (Q6: option A).
- Friendship widening what a profile shows: ratings stay limited to communities you share (find-people.md §4).
- Live push or polling for the badge: it refreshes on app load and when the tab changes (Q4).
- A real notification channel (push, in-app inbox) — the stub is the single place one plugs in.
- Friend counts in the admin area.
- Offline reading of the Friends screen — Phase 6. Offline, every friend action is disabled.
- Visual design: every visual choice is a placeholder from existing tokens and primitives (the tab icon included).

## 3. Data model changes

Migration: `npx prisma migrate dev --create-only --name add_friends`, the SQL inspected and the hand-written index appended, then applied; drift checked; `community_members_one_owner` and `ratings_score_range` confirmed present afterwards. `friends` is added to the test database's `TRUNCATE` list.

```prisma
enum FriendStatus {
  PENDING
  ACCEPTED
}

/// A friend request, and once accepted a friendship (UC-6, UC-7,
/// docs/features/friend-requests.md §3). One row per pair, in either direction:
/// the hand-written unique index `friends_one_per_pair` (in the add_friends
/// migration; Prisma cannot express it) stops B→A existing beside A→B.
model Friend {
  requesterId String       @map("requester_id") @db.Uuid
  addresseeId String       @map("addressee_id") @db.Uuid
  status      FriendStatus @default(PENDING)
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  /// Set on every write; for an accepted row, when it was accepted.
  updatedAt   DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  requester   User         @relation("FriendRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User         @relation("FriendAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@id([requesterId, addresseeId])
  @@index([addresseeId, status, createdAt(sort: Desc)])
  @@map("friends")
}
```

Hand-written, appended to the migration:

```sql
-- One row per pair, whichever direction it was sent in (friend-requests.md §3).
CREATE UNIQUE INDEX "friends_one_per_pair"
  ON "friends" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));
-- Nobody befriends themselves.
ALTER TABLE "friends" ADD CONSTRAINT "friends_not_self" CHECK ("requester_id" <> "addressee_id");
```

- Composite primary key `(requester_id, addressee_id)`, as `tables.md` specifies; the pair index adds the reverse direction. Both are invisible to Prisma and to `prisma migrate diff` (like `community_members_one_owner`), and `db push` would drop them — the project uses migrations only.
- The index on `(addressee_id, status, created_at DESC)` serves "my incoming requests, newest first", the badge count, and the cascade when an addressee's account is deleted (the primary key starts with `requester_id`, which serves the requester's side).
- Cascades: deleting either user deletes the row — a request from a deleted account vanishes, which is UC-7's "ghost request".
- Accepting updates `status` in place; ignoring and cancelling delete the row.

## 4. API

All responses use the CLAUDE.md §4 envelope. Every endpoint requires a signed-in user who has finished onboarding: `requireAuth`, and `403` "Finish your profile first." from the service otherwise. A target user who is unknown, malformed, or mid-onboarding is `404` "User not found." (as in find-people.md).

### Shapes

```ts
type Friendship = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS';

FriendView {          // utils/friendView.ts, field by field
  user: MemberUser;   // id, displayName, profilePictureUrl — nothing more
  since: string;      // for a friend: when accepted; for a request: when sent
}
```

`Friendship` is always the **viewer's** relation to the target, never anyone else's.

### `GET /api/users/:userId` — changed

- **Success:** `200 { user: ProfileUser, friendship: Friendship }`. For the caller's own id, `friendship` is `'NONE'` (the client redirects to My Profile anyway).

### `POST /api/friends/requests`

Send a request (UC-6).

- **Request:** `{ userId: string }` (UUID), `.strict()`.
- **Behaviour**, in one transaction:
  - No row between the two → create `PENDING` (caller → target). Then the notification stub. → `REQUEST_SENT`.
  - The caller already sent one → nothing changes. → `REQUEST_SENT` (idempotent).
  - The target already sent one to the caller → it is accepted. Then the acceptance stub. → `FRIENDS`.
  - Already friends → nothing changes. → `FRIENDS`.
  - Two requests racing in opposite directions: the pair index rejects the second insert (`P2002`); the service re-reads and resolves it as "the target already sent one" → accepted.
- **Success:** `200 { friendship: 'REQUEST_SENT' | 'FRIENDS' }`.
- **Errors:** `400` unparseable JSON; `401`; `403` mid-onboarding; `404` "User not found."; `422` "You can't add yourself." (own id), or a body that fails validation.

### `DELETE /api/friends/requests/sent/:userId`

Cancel your own pending request (Q5).

- **Behaviour:** deletes the caller → target row only if it is `PENDING`. Idempotent: nothing to cancel is still `200`.
- **Success:** `200 { friendship: Friendship }` — the relation after the call (`NONE`, or `FRIENDS` / `REQUEST_RECEIVED` if that is what exists).
- **Errors:** `401`; `403` mid-onboarding; `404` "User not found." (malformed or unknown id).

### `POST /api/friends/requests/:userId/accept`

`:userId` is the person who sent the request.

- **Behaviour:** updates their `PENDING` row to `ACCEPTED`. Then the acceptance stub.
- **Success:** `200 { friend: FriendView }`.
- **Errors:** `401`; `403` mid-onboarding; `404` "This request is no longer valid as the user account does not exist." — the sender's account is gone or mid-onboarding (UC-7's fail path; also a malformed id); `404` "This request is no longer available." — the account exists but there is no pending request from them (cancelled, already ignored, or already accepted in another tab).

### `POST /api/friends/requests/:userId/ignore`

- **Behaviour:** deletes their `PENDING` row (UC-7). Idempotent: `200` when there is nothing to ignore. The sender is not told.
- **Success:** `200 null`.
- **Errors:** `401`; `403` mid-onboarding; `404` "User not found." (malformed id only).

### `GET /api/friends`

- **Success:** `200 { friends: FriendView[] }` — every accepted friendship of the caller, either direction, alphabetical by display-name key. No paging: friend groups are small.
- **Errors:** `401`; `403`.

### `GET /api/friends/requests`

- **Success:** `200 { requests: FriendView[] }` — pending requests **to** the caller, newest first. No paging.
- **Errors:** `401`; `403`.

### `GET /api/friends/requests/count`

- **Success:** `200 { count: number }` — the badge. One indexed `count`.
- **Errors:** `401`; `403`.

### 4.4 Notification stub

`services/friendNotification.ts` — `notifyFriendRequest({ requesterId, addresseeId })` and `notifyFriendAccepted({ requesterId, addresseeId })` log `info` with the two ids only ("Friend request notification (stub)", "Friend accepted notification (stub)"), after the transaction commits. Names are never logged. A failure inside is caught and logged at `warn`; it never fails the request, which is already saved. The single place a real channel plugs in, as `ratingNotification.ts` is.

### Logging

`info` `{ userId, targetId, result }` "Friend request sent" (`result`: `sent` / `accepted-mutual` / `unchanged`); `{ userId, requesterId }` "Friend request accepted" / "Friend request ignored"; `{ userId, targetId }` "Friend request cancelled". Ids only.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Tab bar (`BottomNav`)

- Five tabs: Home, Search, **Friends**, My List, Profile — 75 px each at 375 px.
- The Friends tab shows a badge with the pending count when it is above zero ("9+" above nine). Its accessible name reads "Friends, 2 requests" (or "Friends" with none).
- The count lives in a small store (`stores/friendRequests.ts`): fetched when the tab layout mounts and on every route change, and set directly by the Friends screen after an accept or ignore. A failed count fetch shows no badge and is not an error state.

### 5.2 Friends (`pages/Friends.tsx`, route `/friends`, inside the tab layout)

- Heading "Friends".
- **Requests** section, shown only when there are any: one row per request, newest first — `PersonLink` (avatar + name, to their profile), the relative time sent, and **Accept** and **Ignore** buttons. While one is in flight, that row's buttons are busy/disabled.
  - Accept → the row leaves Requests and the person appears in Your friends; toast "You're now friends with {name}." Badge decremented.
  - Ignore → the row leaves; no toast (nothing to announce). Badge decremented.
  - Accept answering `404` → the row leaves, the badge is refreshed, and the server's message is toasted (UC-7: "This request is no longer valid as the user account does not exist.", or "This request is no longer available.").
  - Any other failure → the row stays; toast "Action failed. Please check your internet connection and try again."
- **Your friends** section: one row per friend, alphabetical — `PersonLink`. No actions in this feature.
- **Loading:** skeleton rows for both sections.
- **Empty:** no requests and no friends → "No friends yet" / "Find people on the Search tab and add them as friends." with a link to Search. With requests but no friends, Your friends reads "Friends you accept appear here."
- **Error:** `LoadError` — "Couldn't load your friends." with Try again (the two lists load together).
- **Offline:** banner "You're offline. Connect to answer requests." with Accept and Ignore disabled; the lists stay readable.

### 5.3 Public Profile — the friend button

Under the header, one control by `friendship`:

| `friendship`       | Control                             | Tap                                                                                        |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `NONE`             | **Add Friend** (primary)            | Sends; becomes Request sent (or Friends, if they had requested you). Toast "Request sent". |
| `REQUEST_SENT`     | **Request sent** (secondary)        | Opens a sheet: "Cancel request" and Close. Cancelling → Add Friend.                        |
| `REQUEST_RECEIVED` | **Respond** (primary)               | Opens a sheet: "{name} sent you a friend request." with **Accept** and **Ignore**.         |
| `FRIENDS`          | **Friends** — a label, not a button | — (Remove Friend arrives with feature 3)                                                   |

- Every action sets the button from the server's answer, not a guess, and refreshes the badge after Accept / Ignore.
- While an action runs the control shows busy; failures toast "Action failed. Please check your internet connection and try again." and leave the state as it was. A `404` from Accept on the sheet toasts the server's message and reloads the profile.
- **Offline:** the control is disabled.
- Loading: the control is not shown until the profile has loaded (it comes with it).

### 5.4 Copy

In `lib/friendCopy.ts`, constants only.

## 6. Edge cases & failure modes

- **Mutual requests:** B requests A while A's request to B is pending → accepted at once, both are friends, and A's acceptance stub fires. Concurrent opposite requests are resolved through the pair index (§4).
- **Double tap / two tabs:** sending twice is idempotent; accepting an already accepted request is `404` "no longer available" and the UI reloads to the true state.
- **Cancel vs. accept race:** the sender cancels while the receiver taps Accept → whichever commits first wins; the loser gets `404` ("no longer available") or a no-op `200`.
- **Ignore then re-send:** allowed (Q3); the receiver sees a new request.
- **Ghost request (UC-7):** the sender's account is deleted → the row is gone by cascade; a Requests list loaded before that shows it until Accept answers `404` with UC-7's message, and the row leaves.
- **A user mid-onboarding** can neither send nor receive (they are not in the directory); their profile is already `404`.
- **Your own id:** `422` from send; your own profile redirects to My Profile, so the button never shows for yourself.
- **The badge is stale** after a request arrives while you sit on one screen — accepted (Q4): it refreshes on the next navigation.
- **Network drop mid-action:** the UC-8-style toast, state unchanged.

## 7. Test scenarios

**Unit — `friend.service`**

- ✅ Send creates a pending request and notifies (stub called with the two ids).
- ✅ Send is idempotent when the caller already sent one.
- ✅ Send accepts the target's pending request instead (mutual) and fires the acceptance stub.
- ✅ Send returns `FRIENDS` unchanged when already friends.
- ✅ Send resolves a `P2002` from a racing opposite insert as mutual acceptance.
- ❌ Send to yourself → `422`; to an unknown or mid-onboarding user → `404`; by a caller mid-onboarding → `403`.
- ✅ A failing notification stub is logged and does not fail the send.
- ✅ Cancel deletes the caller's pending request; idempotent with nothing to cancel; leaves an accepted friendship alone.
- ✅ Accept turns their pending request into a friendship and notifies.
- ❌ Accept with no pending request → `404` "no longer available"; from a missing sender → `404` UC-7 message.
- ✅ Ignore deletes their pending request; idempotent; never touches the caller's own outgoing request or a friendship.
- ✅ Friends lists both directions, alphabetical; requests lists incoming pending only, newest first; count counts them.
- ✅ `friendshipOf` maps each of the four states, in both directions.

**Unit — serialisers**

- ✅ `toFriendView` has exactly `user` (three keys) and `since`.

**Integration (Supertest)**

- ✅ Lifecycle: A sends → B's count is 1 and B's requests list A → B accepts → both list each other in `/friends`, both profiles say `FRIENDS`.
- ✅ Profiles report `REQUEST_SENT` to the sender and `REQUEST_RECEIVED` to the receiver.
- ✅ Ignore: A sends, B ignores → B's list is empty, A's profile of B says `NONE`, and A can send again.
- ✅ Cancel: A sends, A cancels → B's count is 0.
- ✅ Mutual: A sends, B sends → both `FRIENDS`, one row.
- ✅ The database refuses a reverse-direction row inserted directly (`friends_one_per_pair`) and a self row (`friends_not_self`).
- ✅ Deleting the sender's account removes the request (cascade); B's Accept → `404` with UC-7's message.
- ❌ `422`: send without `userId`, with a malformed one, with an unknown key, or to yourself.
- ❌ `401` on every endpoint signed out; `403` mid-onboarding.
- ❌ `404`: send to an unknown user; accept with no request; cancel / ignore with a malformed id.
- ✅ No endpoint returns any field beyond the documented shapes (exact key sets).

**Component (Vitest + RTL)**

- ✅ Tab bar: five tabs; the Friends badge shows the count, "9+" above nine, none at zero; the accessible name includes the count.
- ✅ Friends: skeletons; requests and friends render with profile links; the combined empty state links to Search.
- ✅ Friends: Accept moves the row to Your friends, toasts, decrements the badge.
- ✅ Friends: Ignore removes the row without a toast and decrements the badge.
- ❌ Friends: Accept `404` removes the row and toasts the server's message; a network failure keeps the row and toasts.
- ❌ Friends: load error with Try again; offline banner disables the buttons.
- ✅ Profile button: each of the four states; Add Friend → Request sent; Request sent → sheet → Cancel → Add Friend; Respond → sheet → Accept → Friends; Respond → Ignore → Add Friend.
- ❌ Profile button: a failure toasts and keeps the state; disabled offline.

**E2E** — part of the golden loop (Phase 5's "two users, one sends, the other accepts").

- A finds B through search and taps Add Friend; B sees the badge, opens Friends, accepts; both see each other under Your friends and "Friends" on the profile. (Chromium and iPhone WebKit; fresh accounts, no global state.)

## 8. Open questions & risks

- None at approval.
- Accepted risk (Q2, Q3): anyone signed in can send a request, and re-send after an ignore. With friend-group scale this is tolerable; blocking or a silent ignore is the upgrade path if it is ever abused.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `friends` — `updated_at`, the hand-written pair index and self check, the addressee index, cascades.
- `docs/use cases.md` + `.docx`: UC-6 — the Friends tab badge is the in-app notification (a log stub behind it); a sender may cancel; mutual requests become friends; the privacy-settings / blocking fail path withdrawn. UC-7 — the Friends tab; the ghost-request message; re-sending after an ignore is allowed.
- `docs/frontend screens.md` + `.docx`: 2.1 (five tabs, the badge), 2.3 Friends & Requests (layout, states; Remove Friend with feature 3), 2.4 (the button's four states).
- CLAUDE.md §6: the `friends` table's two hand-written objects next to the existing ones.
- `docs/features/find-people.md`: Merged ticked; §0's table gains feature 4 by reference to this document.
- `DEVELOPMENT.md`: Step 5.2's entry per §13, and a new Step 5.5 (Invite friends to a community) for feature 4.

## 10. Decisions log

| Date       | Decision                                                                                                                                                               | Reason                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | UC-9's friends picker becomes a fourth Phase 5 feature after Unfriend (option B)                                                                                       | Keeps this PR reviewable; gives friendship a purpose before the phase ends                                                             |
| 2026-10-06 | Anyone signed in may send a request; no privacy setting, no blocking (option A)                                                                                        | Matches the open directory; finding a friend outside your groups must lead somewhere                                                   |
| 2026-10-06 | Ignore deletes the request; the sender may re-send (option A)                                                                                                          | UC-7 as written; no new state                                                                                                          |
| 2026-10-06 | A fifth Friends tab with a pending-count badge, refreshed on navigation (option A)                                                                                     | The badge is UC-6's in-app notification; visible from anywhere                                                                         |
| 2026-10-06 | The sender cancels from the profile only; no Sent list (option B)                                                                                                      | Undo a mistaken tap where it happened, at little cost                                                                                  |
| 2026-10-06 | Friendships are private; friendship widens nothing on a profile (option A)                                                                                             | Nothing new exposed to the open directory; members-only rule for community content kept                                                |
| 2026-10-06 | A request to someone who requested you accepts theirs; one row per pair, guarded by a hand-written index                                                               | No duplicate pair; concurrent opposite requests resolve deterministically                                                              |
| 2026-10-06 | Sending, cancelling and ignoring are idempotent; accepting a request that is gone is `404`                                                                             | Double taps and two tabs are harmless; a stale Accept is told why                                                                      |
| 2026-10-06 | UC-7's message when the sender's account is gone; "This request is no longer available." otherwise                                                                     | UC-7's fail path, without pretending a cancelled request's sender was deleted                                                          |
| 2026-10-06 | Notification stubs on a new request and on acceptance, ids only                                                                                                        | Same pattern as ratings; the single place a real channel plugs in                                                                      |
| 2026-10-06 | Friends alphabetical, requests newest first, neither paged                                                                                                             | Friend-group scale                                                                                                                     |
| 2026-10-06 | `friendship` travels on `GET /api/users/:userId`                                                                                                                       | The profile and its button load in one request                                                                                         |
| 2026-10-06 | Stage 3: sending back accepts with `updateMany`; if their request vanished meanwhile, a plain request is created; Add Friend that yields `FRIENDS` refreshes the badge | `/code-review`: the `update` threw P2025 (a 500) when the other person cancelled mid-send; the badge kept counting an accepted request |
